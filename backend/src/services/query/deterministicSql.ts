import { SQL_GENERATION_PROMPT, SQL_SCHEMA_CONTEXT } from "./schemaContext";

export type GeneratedSqlResult = {
  sql: string | null;
  outOfScope: boolean;
  source: "deterministic";
  generationContext: string;
};

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function extractCustomerId(text: string): string | null {
  const match = text.match(/\b3\d{8}\b/);
  return match?.[0] ?? null;
}

function extractSalesOrderId(text: string): string | null {
  const match = text.match(/\b7\d{5}\b/);
  return match?.[0] ?? null;
}

function extractBillingDocumentId(text: string): string | null {
  const match = text.match(/\b9\d{7}\b/);
  return match?.[0] ?? null;
}

function sqlForBrokenFlows(): string {
  return [
    "WITH flow AS (",
    "SELECT",
    "so.salesOrder,",
    "MAX(CASE WHEN odi.deliveryDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasDelivery,",
    "MAX(CASE WHEN bdi.billingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasBilling,",
    "MAX(CASE WHEN jei.accountingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasJournal,",
    "MAX(CASE WHEN par.accountingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasPayment",
    "FROM sales_order_headers so",
    "JOIN sales_order_items soi ON so.salesOrder = soi.salesOrder",
    "LEFT JOIN outbound_delivery_items odi",
    "ON odi.referenceSdDocument = soi.salesOrder",
    "AND odi.referenceSdDocumentItem = soi.salesOrderItem",
    "LEFT JOIN billing_document_items bdi",
    "ON bdi.referenceSdDocument = odi.deliveryDocument",
    "AND bdi.referenceSdDocumentItem = odi.deliveryDocumentItem",
    "LEFT JOIN billing_document_headers bh ON bh.billingDocument = bdi.billingDocument",
    "LEFT JOIN journal_entry_items_accounts_receivable jei",
    "ON jei.referenceDocument = bh.billingDocument",
    "LEFT JOIN payments_accounts_receivable par",
    "ON par.companyCode = jei.companyCode",
    "AND par.fiscalYear = jei.fiscalYear",
    "AND par.accountingDocument = jei.accountingDocument",
    "AND par.accountingDocumentItem = jei.accountingDocumentItem",
    "GROUP BY so.salesOrder",
    ")",
    "SELECT salesOrder, hasDelivery, hasBilling, hasJournal, hasPayment",
    "FROM flow",
    "WHERE hasDelivery = 0 OR hasBilling = 0 OR hasJournal = 0 OR hasPayment = 0",
    "ORDER BY salesOrder ASC",
    "LIMIT 200",
  ].join(" ");
}

function sqlForTraceBillingDocument(billingDocumentId: string): string {
  return [
    "SELECT",
    "bh.billingDocument,",
    "bh.billingDocumentDate,",
    "bh.soldToParty AS customerId,",
    "bi.billingDocumentItem,",
    "bi.material AS productId,",
    "bi.netAmount AS billingItemNetAmount,",
    "odi.deliveryDocument,",
    "odi.deliveryDocumentItem,",
    "soi.salesOrder,",
    "soi.salesOrderItem,",
    "jei.companyCode,",
    "jei.fiscalYear,",
    "jei.accountingDocument AS journalAccountingDocument,",
    "jei.accountingDocumentItem AS journalAccountingDocumentItem,",
    "par.accountingDocument AS paymentAccountingDocument,",
    "par.accountingDocumentItem AS paymentAccountingDocumentItem",
    "FROM billing_document_headers bh",
    "LEFT JOIN billing_document_items bi ON bh.billingDocument = bi.billingDocument",
    "LEFT JOIN outbound_delivery_items odi",
    "ON bi.referenceSdDocument = odi.deliveryDocument",
    "AND bi.referenceSdDocumentItem = odi.deliveryDocumentItem",
    "LEFT JOIN sales_order_items soi",
    "ON odi.referenceSdDocument = soi.salesOrder",
    "AND odi.referenceSdDocumentItem = soi.salesOrderItem",
    "LEFT JOIN journal_entry_items_accounts_receivable jei",
    "ON jei.referenceDocument = bh.billingDocument",
    "LEFT JOIN payments_accounts_receivable par",
    "ON par.companyCode = jei.companyCode",
    "AND par.fiscalYear = jei.fiscalYear",
    "AND par.accountingDocument = jei.accountingDocument",
    "AND par.accountingDocumentItem = jei.accountingDocumentItem",
    `WHERE bh.billingDocument = '${billingDocumentId}'`,
    "ORDER BY bi.billingDocumentItem ASC",
  ].join(" ");
}

function sqlForTraceSummary(): string {
  return [
    "SELECT",
    "bh.billingDocument,",
    "bh.billingDocumentDate,",
    "bh.soldToParty AS customerId,",
    "COUNT(DISTINCT bi.billingDocumentItem) AS billingItemCount,",
    "COUNT(DISTINCT odi.deliveryDocument) AS linkedDeliveryCount,",
    "COUNT(DISTINCT soi.salesOrder) AS linkedSalesOrderCount",
    "FROM billing_document_headers bh",
    "LEFT JOIN billing_document_items bi ON bh.billingDocument = bi.billingDocument",
    "LEFT JOIN outbound_delivery_items odi",
    "ON bi.referenceSdDocument = odi.deliveryDocument",
    "AND bi.referenceSdDocumentItem = odi.deliveryDocumentItem",
    "LEFT JOIN sales_order_items soi",
    "ON odi.referenceSdDocument = soi.salesOrder",
    "AND odi.referenceSdDocumentItem = soi.salesOrderItem",
    "GROUP BY bh.billingDocument, bh.billingDocumentDate, bh.soldToParty",
    "ORDER BY bh.billingDocumentDate DESC",
    "LIMIT 20",
  ].join(" ");
}

export function generateDeterministicSql(question: string): GeneratedSqlResult {
  const normalized = question.toLowerCase();
  const customerId = extractCustomerId(normalized);
  const salesOrderId = extractSalesOrderId(normalized);
  const billingDocumentId = extractBillingDocumentId(normalized);
  const context = `${SQL_GENERATION_PROMPT}\n\n${SQL_SCHEMA_CONTEXT}`;

  if (
    hasAny(normalized, ["highest", "top", "most"]) &&
    hasAny(normalized, ["product", "products", "material"]) &&
    hasAny(normalized, ["billing document", "billing documents", "invoice", "billing"])
  ) {
    return {
      sql: [
        "SELECT bi.material AS productId,",
        "COUNT(DISTINCT bi.billingDocument) AS billingDocumentCount,",
        "ROUND(SUM(bi.netAmount), 2) AS billedNetAmount,",
        "bi.transactionCurrency",
        "FROM billing_document_items bi",
        "GROUP BY bi.material, bi.transactionCurrency",
        "ORDER BY billingDocumentCount DESC, billedNetAmount DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["top", "highest", "most"]) && hasAny(normalized, ["product", "products", "material"])) {
    return {
      sql: [
        "SELECT bi.material AS productId,",
        "COUNT(DISTINCT bi.billingDocument) AS billingDocumentCount,",
        "ROUND(SUM(bi.netAmount), 2) AS billedNetAmount,",
        "bi.transactionCurrency",
        "FROM billing_document_items bi",
        "GROUP BY bi.material, bi.transactionCurrency",
        "ORDER BY billingDocumentCount DESC, billedNetAmount DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (
    hasAny(normalized, ["top", "highest", "largest"]) &&
    hasAny(normalized, ["customer", "customers", "sold to"]) &&
    hasAny(normalized, ["billing", "invoice", "revenue", "net amount"])
  ) {
    return {
      sql: [
        "SELECT bh.soldToParty AS customerId, bh.transactionCurrency,",
        "COUNT(DISTINCT bh.billingDocument) AS billingDocumentCount,",
        "ROUND(SUM(bh.totalNetAmount), 2) AS billedNetAmount",
        "FROM billing_document_headers bh",
        "GROUP BY bh.soldToParty, bh.transactionCurrency",
        "ORDER BY billedNetAmount DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["top", "highest", "largest"]) && hasAny(normalized, ["customer", "customers"])) {
    return {
      sql: [
        "SELECT bh.soldToParty AS customerId, bh.transactionCurrency,",
        "COUNT(DISTINCT bh.billingDocument) AS billingDocumentCount,",
        "ROUND(SUM(bh.totalNetAmount), 2) AS billedNetAmount",
        "FROM billing_document_headers bh",
        "GROUP BY bh.soldToParty, bh.transactionCurrency",
        "ORDER BY billedNetAmount DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["broken", "incomplete"]) && hasAny(normalized, ["sales order", "flow"])) {
    return {
      sql: sqlForBrokenFlows(),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["trace", "full flow"]) && hasAny(normalized, ["billing document", "invoice"])) {
    return {
      sql: billingDocumentId ? sqlForTraceBillingDocument(billingDocumentId) : sqlForTraceSummary(),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["fiscal year", "fiscal years", "financial year", "financial years"])) {
    return {
      sql: [
        "SELECT fiscalYear, COUNT(*) AS billingDocumentCount, ROUND(SUM(totalNetAmount), 2) AS billedNetAmount",
        "FROM billing_document_headers",
        "GROUP BY fiscalYear",
        "ORDER BY fiscalYear DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["company code", "company codes"])) {
    return {
      sql: [
        "SELECT companyCode, COUNT(*) AS billingDocumentCount, ROUND(SUM(totalNetAmount), 2) AS billedNetAmount",
        "FROM billing_document_headers",
        "GROUP BY companyCode",
        "ORDER BY billingDocumentCount DESC",
        "LIMIT 50",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["currency", "currencies"])) {
    return {
      sql: [
        "WITH currencies AS (",
        "SELECT transactionCurrency AS currency, COUNT(*) AS recordCount FROM billing_document_headers GROUP BY transactionCurrency",
        "UNION ALL",
        "SELECT transactionCurrency AS currency, COUNT(*) AS recordCount FROM sales_order_headers GROUP BY transactionCurrency",
        "UNION ALL",
        "SELECT transactionCurrency AS currency, COUNT(*) AS recordCount FROM payments_accounts_receivable GROUP BY transactionCurrency",
        ")",
        "SELECT currency, SUM(recordCount) AS recordCount",
        "FROM currencies",
        "GROUP BY currency",
        "ORDER BY recordCount DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["billing document type", "billing types", "invoice type", "invoice types"])) {
    return {
      sql: [
        "SELECT billingDocumentType, COUNT(*) AS billingDocumentCount",
        "FROM billing_document_headers",
        "GROUP BY billingDocumentType",
        "ORDER BY billingDocumentCount DESC",
        "LIMIT 20",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["plants", "plant list", "show plants"])) {
    return {
      sql: "SELECT plant, plantName, salesOrganization FROM plants ORDER BY plant ASC LIMIT 200",
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["customer list", "list customers", "customers"])) {
    return {
      sql: [
        "SELECT customer AS customerId, businessPartnerName, businessPartnerCategory, businessPartnerIsBlocked",
        "FROM business_partners",
        "ORDER BY businessPartnerName ASC",
        "LIMIT 200",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["payment info", "payments"])) {
    return {
      sql: [
        "SELECT companyCode, fiscalYear, transactionCurrency, COUNT(*) AS paymentItemCount,",
        "ROUND(SUM(amountInTransactionCurrency), 2) AS totalAmountInTransactionCurrency",
        "FROM payments_accounts_receivable",
        "GROUP BY companyCode, fiscalYear, transactionCurrency",
        "ORDER BY paymentItemCount DESC",
        "LIMIT 50",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["billing trend", "billing trends by year", "invoice trend", "invoice trends"])) {
    return {
      sql: [
        "SELECT SUBSTR(billingDocumentDate, 1, 4) AS billingYear,",
        "COUNT(*) AS billingDocumentCount,",
        "ROUND(SUM(totalNetAmount), 2) AS billedNetAmount",
        "FROM billing_document_headers",
        "GROUP BY billingYear",
        "ORDER BY billingYear ASC",
        "LIMIT 50",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["count invoices by company code", "count billing by company code"])) {
    return {
      sql: [
        "SELECT companyCode, COUNT(*) AS billingDocumentCount",
        "FROM billing_document_headers",
        "GROUP BY companyCode",
        "ORDER BY billingDocumentCount DESC",
        "LIMIT 50",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["how many", "count"]) && normalized.includes("sales order")) {
    return {
      sql: "SELECT COUNT(*) AS salesOrderCount FROM sales_order_headers",
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["how many", "count"]) && hasAny(normalized, ["billing", "invoice"])) {
    return {
      sql: "SELECT COUNT(*) AS billingDocumentCount FROM billing_document_headers",
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["how many", "count"]) && normalized.includes("delivery")) {
    return {
      sql: "SELECT COUNT(*) AS outboundDeliveryCount FROM outbound_delivery_headers",
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (hasAny(normalized, ["total", "sum"]) && normalized.includes("sales order")) {
    return {
      sql: [
        "SELECT transactionCurrency, ROUND(SUM(totalNetAmount), 2) AS totalSalesOrderNetAmount",
        "FROM sales_order_headers",
        "GROUP BY transactionCurrency",
        "ORDER BY totalSalesOrderNetAmount DESC",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (customerId && hasAny(normalized, ["billing", "invoice"])) {
    return {
      sql: [
        "SELECT billingDocument, billingDocumentDate, billingDocumentType, billingDocumentIsCancelled, totalNetAmount, transactionCurrency",
        "FROM billing_document_headers",
        `WHERE soldToParty = '${customerId}'`,
        "ORDER BY billingDocumentDate DESC",
        "LIMIT 50",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (customerId && normalized.includes("sales order")) {
    return {
      sql: [
        "SELECT salesOrder, salesOrderType, creationDate, requestedDeliveryDate, totalNetAmount, transactionCurrency, overallDeliveryStatus",
        "FROM sales_order_headers",
        `WHERE soldToParty = '${customerId}'`,
        "ORDER BY creationDate DESC",
        "LIMIT 50",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (salesOrderId) {
    return {
      sql: [
        "SELECT so.salesOrder, so.soldToParty, so.creationDate, so.totalNetAmount, so.transactionCurrency,",
        "soi.salesOrderItem, soi.material, soi.requestedQuantity, soi.netAmount",
        "FROM sales_order_headers so",
        "JOIN sales_order_items soi ON so.salesOrder = soi.salesOrder",
        `WHERE so.salesOrder = '${salesOrderId}'`,
        "ORDER BY soi.salesOrderItem ASC",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  if (billingDocumentId) {
    return {
      sql: [
        "SELECT bh.billingDocument, bh.billingDocumentDate, bh.soldToParty, bh.totalNetAmount, bh.transactionCurrency,",
        "bi.billingDocumentItem, bi.material, bi.billingQuantity, bi.netAmount",
        "FROM billing_document_headers bh",
        "LEFT JOIN billing_document_items bi ON bh.billingDocument = bi.billingDocument",
        `WHERE bh.billingDocument = '${billingDocumentId}'`,
        "ORDER BY bi.billingDocumentItem ASC",
      ].join(" "),
      outOfScope: false,
      source: "deterministic",
      generationContext: context,
    };
  }

  return {
    sql: null,
    outOfScope: false,
    source: "deterministic",
    generationContext: context,
  };
}
