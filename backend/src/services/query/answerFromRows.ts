function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function getStringFromRow(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) {
      continue;
    }

    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

const NODE_ID_PATTERN =
  /^(business_partner|sales_order|sales_order_item|outbound_delivery|outbound_delivery_item|billing_document|billing_document_item|journal_entry_item|payment|product|plant):.+$/;

function getNodeIds(row: Record<string, unknown>): string[] {
  const ids: string[] = [];

  const billingDocument = getStringFromRow(row, ["billingDocument"]);
  const billingDocumentItem = getStringFromRow(row, ["billingDocumentItem"]);
  const salesOrder = getStringFromRow(row, ["salesOrder"]);
  const salesOrderItem = getStringFromRow(row, ["salesOrderItem"]);
  const deliveryDocument = getStringFromRow(row, ["deliveryDocument"]);
  const deliveryDocumentItem = getStringFromRow(row, ["deliveryDocumentItem"]);
  const customerId = getStringFromRow(row, ["customerId", "customer", "soldToParty"]);
  const productId = getStringFromRow(row, ["productId", "material", "product"]);
  const plant = getStringFromRow(row, ["plant"]);

  const journalAccountingDocument = getStringFromRow(row, ["journalAccountingDocument", "accountingDocument"]);
  const journalAccountingDocumentItem = getStringFromRow(row, [
    "journalAccountingDocumentItem",
    "accountingDocumentItem",
  ]);
  const companyCode = getStringFromRow(row, ["companyCode"]);
  const fiscalYear = getStringFromRow(row, ["fiscalYear"]);

  const paymentAccountingDocument = getStringFromRow(row, ["paymentAccountingDocument"]);
  const paymentAccountingDocumentItem = getStringFromRow(row, ["paymentAccountingDocumentItem"]);

  if (billingDocument) {
    ids.push(`billing_document:${billingDocument}`);
  }

  if (billingDocument && billingDocumentItem) {
    ids.push(`billing_document_item:${billingDocument}|${billingDocumentItem}`);
  }

  if (salesOrder) {
    ids.push(`sales_order:${salesOrder}`);
  }

  if (salesOrder && salesOrderItem) {
    ids.push(`sales_order_item:${salesOrder}|${salesOrderItem}`);
  }

  if (deliveryDocument) {
    ids.push(`outbound_delivery:${deliveryDocument}`);
  }

  if (deliveryDocument && deliveryDocumentItem) {
    ids.push(`outbound_delivery_item:${deliveryDocument}|${deliveryDocumentItem}`);
  }

  if (customerId) {
    ids.push(`business_partner:${customerId}`);
  }

  if (productId) {
    ids.push(`product:${productId}`);
  }

  if (plant) {
    ids.push(`plant:${plant}`);
  }

  if (companyCode && fiscalYear && journalAccountingDocument && journalAccountingDocumentItem) {
    ids.push(
      `journal_entry_item:${companyCode}|${fiscalYear}|${journalAccountingDocument}|${journalAccountingDocumentItem}`,
    );
  }

  if (companyCode && fiscalYear && paymentAccountingDocument && paymentAccountingDocumentItem) {
    ids.push(`payment:${companyCode}|${fiscalYear}|${paymentAccountingDocument}|${paymentAccountingDocumentItem}`);
  }

  return [...new Set(ids)];
}

function buildHighlights(rows: Record<string, unknown>[]): string[] {
  const highlightIds = new Set<string>();

  for (const row of rows) {
    for (const id of getNodeIds(row)) {
      if (!NODE_ID_PATTERN.test(id)) {
        continue;
      }

      highlightIds.add(id);
      if (highlightIds.size >= 16) {
        return [...highlightIds];
      }
    }
  }

  return [...highlightIds];
}

function uniqueStrings(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function pickFirstExistingKey(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return key;
    }
  }

  return null;
}

function summarizeDistinctValues(
  rows: Record<string, unknown>[],
  keys: string[],
  singularLabel: string,
  pluralLabel: string,
): string | null {
  const values = uniqueStrings(rows.map((row) => getStringFromRow(row, keys)));
  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return `${singularLabel}: ${values[0]}.`;
  }

  const preview = values.slice(0, 8).join(", ");
  if (values.length <= 8) {
    return `${pluralLabel}: ${preview}.`;
  }

  return `${pluralLabel}: ${preview}, and ${values.length - 8} more.`;
}

function summarizeRankedEntities(
  rows: Record<string, unknown>[],
  labelKeys: string[],
  metricKeys: string[],
  entityLabel: string,
): string | null {
  const ranked = rows
    .map((row) => {
      const entity = getStringFromRow(row, labelKeys);
      const metric = metricKeys.map((key) => getNumber(row[key])).find((value) => value !== null);
      return {
        entity,
        metric,
      };
    })
    .filter(
      (item): item is { entity: string; metric: number } =>
        typeof item.entity === "string" && typeof item.metric === "number",
    );

  if (ranked.length === 0) {
    return null;
  }

  const top = ranked.slice(0, 3);
  if (top.length === 1) {
    return `Top ${entityLabel}: ${top[0].entity} (${top[0].metric.toLocaleString()}).`;
  }

  const items = top.map((item) => `${item.entity} (${item.metric.toLocaleString()})`).join(", ");
  return `Top ${entityLabel}: ${items}.`;
}

function answerForDomainPatterns(question: string, rows: Record<string, unknown>[]): string | null {
  const normalized = question.toLowerCase();

  const productRanking = summarizeRankedEntities(
    rows,
    ["productId", "material", "product"],
    ["billingDocumentCount", "documentCount", "billedCount"],
    "products",
  );
  if (hasAny(normalized, ["top", "highest", "most"]) && hasAny(normalized, ["product", "material"])) {
    return (
      productRanking ??
      summarizeDistinctValues(rows, ["productId", "material", "product"], "Product", "Products")
    );
  }

  const customerRanking = summarizeRankedEntities(
    rows,
    ["customerId", "soldToParty", "customer"],
    ["billedNetAmount", "billingDocumentCount", "documentCount"],
    "customers",
  );
  if (hasAny(normalized, ["top", "highest", "most"]) && hasAny(normalized, ["customer", "customers"])) {
    return customerRanking ??
      summarizeDistinctValues(rows, ["customerId", "soldToParty", "customer"], "Customer", "Customers");
  }

  if (hasAny(normalized, ["trace", "flow"]) && hasAny(normalized, ["billing", "invoice"])) {
    const billingDocument = getStringFromRow(rows[0], ["billingDocument"]);
    const deliveries = new Set(
      rows
        .map((row) => getStringFromRow(row, ["deliveryDocument"]))
        .filter((value): value is string => Boolean(value)),
    );
    const salesOrders = new Set(
      rows
        .map((row) => getStringFromRow(row, ["salesOrder"]))
        .filter((value): value is string => Boolean(value)),
    );
    const journals = new Set(
      rows
        .map((row) => getStringFromRow(row, ["journalAccountingDocument"]))
        .filter((value): value is string => Boolean(value)),
    );
    const payments = new Set(
      rows
        .map((row) => getStringFromRow(row, ["paymentAccountingDocument"]))
        .filter((value): value is string => Boolean(value)),
    );

    const parts = [
      `${salesOrders.size} sales order${salesOrders.size === 1 ? "" : "s"}`,
      `${deliveries.size} deliver${deliveries.size === 1 ? "y" : "ies"}`,
      `${journals.size} journal entr${journals.size === 1 ? "y" : "ies"}`,
      `${payments.size} payment${payments.size === 1 ? "" : "s"}`,
    ];
    return `Flow for billing document ${billingDocument ?? "(selected set)"} connects to ${parts.join(", ")}.`;
  }

  if (hasAny(normalized, ["broken", "incomplete", "flow"])) {
    const missingDelivery = rows.filter((row) => getNumber(row.hasDelivery) === 0).length;
    const missingBilling = rows.filter((row) => getNumber(row.hasBilling) === 0).length;
    const missingJournal = rows.filter((row) => getNumber(row.hasJournal) === 0).length;
    const missingPayment = rows.filter((row) => getNumber(row.hasPayment) === 0).length;
    return `Incomplete sales-order flows are present. Missing stages: delivery ${missingDelivery}, billing ${missingBilling}, journal ${missingJournal}, payment ${missingPayment}.`;
  }

  const fiscalYearSummary = summarizeDistinctValues(rows, ["fiscalYear"], "Fiscal year", "Fiscal years");
  if (
    fiscalYearSummary &&
    (hasAny(normalized, ["fiscal", "financial year", "year"]) ||
      Object.prototype.hasOwnProperty.call(rows[0], "fiscalYear"))
  ) {
    return fiscalYearSummary;
  }

  const companyCodeSummary = summarizeDistinctValues(rows, ["companyCode"], "Company code", "Company codes");
  if (
    companyCodeSummary &&
    (hasAny(normalized, ["company code", "company"]) || Object.prototype.hasOwnProperty.call(rows[0], "companyCode"))
  ) {
    return companyCodeSummary;
  }

  const currencySummary = summarizeDistinctValues(
    rows,
    ["currency", "transactionCurrency"],
    "Currency",
    "Currencies present",
  );
  if (
    currencySummary &&
    (hasAny(normalized, ["currency", "currencies"]) ||
      Object.prototype.hasOwnProperty.call(rows[0], "currency") ||
      Object.prototype.hasOwnProperty.call(rows[0], "transactionCurrency"))
  ) {
    return currencySummary;
  }

  const billingTypeSummary = summarizeDistinctValues(
    rows,
    ["billingDocumentType", "billingType"],
    "Billing document type",
    "Billing document types",
  );
  if (
    billingTypeSummary &&
    (hasAny(normalized, ["billing type", "billing document type"]) ||
      Object.prototype.hasOwnProperty.call(rows[0], "billingDocumentType"))
  ) {
    return billingTypeSummary;
  }

  const plantSummary = summarizeDistinctValues(rows, ["plant", "plantName"], "Plant", "Plants");
  if (
    plantSummary &&
    (hasAny(normalized, ["plant", "plants"]) || Object.prototype.hasOwnProperty.call(rows[0], "plant"))
  ) {
    return plantSummary;
  }

  const customerSummary = summarizeDistinctValues(rows, ["customerId", "soldToParty"], "Customer", "Customers");
  if (
    customerSummary &&
    (hasAny(normalized, ["customer", "customers"]) || Object.prototype.hasOwnProperty.call(rows[0], "customerId"))
  ) {
    return customerSummary;
  }

  return null;
}

function answerForGenericRows(question: string, rows: Record<string, unknown>[]): string {
  const normalized = question.toLowerCase();

  const discoverColumnsByIntent: Array<{
    terms: string[];
    keys: string[];
    singularLabel: string;
    pluralLabel: string;
  }> = [
    { terms: ["fiscal", "year"], keys: ["fiscalYear"], singularLabel: "Fiscal year", pluralLabel: "Fiscal years" },
    {
      terms: ["company", "code"],
      keys: ["companyCode"],
      singularLabel: "Company code",
      pluralLabel: "Company codes",
    },
    {
      terms: ["currency", "currencies"],
      keys: ["currency", "transactionCurrency"],
      singularLabel: "Currency",
      pluralLabel: "Currencies present",
    },
    {
      terms: ["billing", "type"],
      keys: ["billingDocumentType", "billingType"],
      singularLabel: "Billing document type",
      pluralLabel: "Billing document types",
    },
    { terms: ["plant", "plants"], keys: ["plant"], singularLabel: "Plant", pluralLabel: "Plants" },
    { terms: ["customer", "customers"], keys: ["customerId", "soldToParty"], singularLabel: "Customer", pluralLabel: "Customers" },
    { terms: ["product", "products"], keys: ["productId", "material"], singularLabel: "Product", pluralLabel: "Products" },
  ];

  for (const config of discoverColumnsByIntent) {
    if (!hasAny(normalized, config.terms)) {
      continue;
    }

    const summary = summarizeDistinctValues(rows, config.keys, config.singularLabel, config.pluralLabel);
    if (summary) {
      return summary;
    }
  }

  if (rows.length === 1) {
    const values = Object.values(rows[0]).filter((value) => value !== null && value !== undefined);
    if (values.length === 1) {
      return `${formatPrimitive(values[0])}.`;
    }

    const summary = Object.entries(rows[0])
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${formatPrimitive(value)}`)
      .join(", ");
    return summary || "One matching record was found.";
  }

  const labelKey = pickFirstExistingKey(rows[0], [
    "name",
    "label",
    "productId",
    "material",
    "customerId",
    "companyCode",
    "billingDocument",
    "salesOrder",
    "plant",
    "fiscalYear",
  ]);
  if (labelKey) {
    const values = uniqueStrings(rows.map((row) => getStringFromRow(row, [labelKey])));
    if (values.length === 1) {
      return `${labelKey}: ${values[0]}.`;
    }
    if (values.length > 1) {
      const preview = values.slice(0, 6).join(", ");
      return values.length > 6
        ? `${labelKey}: ${preview}, and ${values.length - 6} more.`
        : `${labelKey}: ${preview}.`;
    }
  }

  const firstRow = rows[0];
  const preview = Object.entries(firstRow)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatPrimitive(value)}`)
    .join(", ");
  return preview ? `Key results include ${preview}.` : "Matching records were found.";
}

export function answerFromRows(
  question: string,
  _sql: string,
  rows: Record<string, unknown>[],
): { answer: string; highlights: string[] } {
  if (rows.length === 0) {
    return {
      answer: "No matching data found.",
      highlights: [],
    };
  }

  const businessAnswer = answerForDomainPatterns(question, rows);
  const answer = businessAnswer ?? answerForGenericRows(question, rows);
  const highlights = buildHighlights(rows);

  return {
    answer,
    highlights,
  };
}
