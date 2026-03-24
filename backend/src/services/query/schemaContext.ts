export const ALLOWED_TABLES = [
  "billing_document_cancellations",
  "billing_document_headers",
  "billing_document_items",
  "business_partner_addresses",
  "business_partners",
  "customer_company_assignments",
  "customer_sales_area_assignments",
  "journal_entry_items_accounts_receivable",
  "outbound_delivery_headers",
  "outbound_delivery_items",
  "payments_accounts_receivable",
  "plants",
  "product_descriptions",
  "product_plants",
  "product_storage_locations",
  "products",
  "sales_order_headers",
  "sales_order_items",
  "sales_order_schedule_lines",
] as const;

export const SQL_SCHEMA_CONTEXT = `
You are querying a SQLite database for SAP Order-to-Cash data.
Only use these tables and columns.

business_partners(
  businessPartner, customer, businessPartnerCategory, businessPartnerName, businessPartnerIsBlocked,
  creationDate, lastChangeDate
)
business_partner_addresses(
  businessPartner, addressId, cityName, country, postalCode, region, streetName
)
customer_company_assignments(customer, companyCode, reconciliationAccount, customerAccountGroup)
customer_sales_area_assignments(
  customer, salesOrganization, distributionChannel, division, currency, customerPaymentTerms
)

sales_order_headers(
  salesOrder, salesOrderType, salesOrganization, distributionChannel, organizationDivision,
  soldToParty, creationDate, requestedDeliveryDate, totalNetAmount, transactionCurrency, overallDeliveryStatus
)
sales_order_items(
  salesOrder, salesOrderItem, material, requestedQuantity, requestedQuantityUnit,
  netAmount, transactionCurrency, productionPlant, storageLocation
)
sales_order_schedule_lines(
  salesOrder, salesOrderItem, scheduleLine, confirmedDeliveryDate, confdOrderQtyByMatlAvailCheck
)

outbound_delivery_headers(
  deliveryDocument, creationDate, shippingPoint, overallGoodsMovementStatus, overallPickingStatus
)
outbound_delivery_items(
  deliveryDocument, deliveryDocumentItem, referenceSdDocument, referenceSdDocumentItem,
  actualDeliveryQuantity, deliveryQuantityUnit, plant, storageLocation
)

billing_document_headers(
  billingDocument, billingDocumentType, billingDocumentDate, billingDocumentIsCancelled,
  cancelledBillingDocument, soldToParty, totalNetAmount, transactionCurrency,
  companyCode, fiscalYear, accountingDocument
)
billing_document_items(
  billingDocument, billingDocumentItem, material, billingQuantity, billingQuantityUnit,
  netAmount, transactionCurrency, referenceSdDocument, referenceSdDocumentItem
)
billing_document_cancellations(
  billingDocument, billingDocumentType, billingDocumentDate, soldToParty, totalNetAmount, transactionCurrency
)

journal_entry_items_accounts_receivable(
  companyCode, fiscalYear, accountingDocument, accountingDocumentItem, referenceDocument,
  customer, postingDate, documentDate, amountInTransactionCurrency, transactionCurrency,
  clearingDate, clearingAccountingDocument
)
payments_accounts_receivable(
  companyCode, fiscalYear, accountingDocument, accountingDocumentItem,
  customer, postingDate, documentDate, amountInTransactionCurrency, transactionCurrency,
  clearingDate, clearingAccountingDocument
)

products(product, productType, productGroup, baseUnit)
product_descriptions(product, language, productDescription)
product_plants(product, plant, availabilityCheckType, profitCenter)
product_storage_locations(product, plant, storageLocation)
plants(plant, plantName, salesOrganization)

Canonical business flow:
business_partners.customer -> sales_order_headers.soldToParty
sales_order_headers.salesOrder -> sales_order_items.salesOrder
sales_order_items.(salesOrder,salesOrderItem) -> outbound_delivery_items.(referenceSdDocument,referenceSdDocumentItem)
outbound_delivery_items.(deliveryDocument,deliveryDocumentItem) -> billing_document_items.(referenceSdDocument,referenceSdDocumentItem)
billing_document_items.billingDocument -> billing_document_headers.billingDocument
billing_document_headers.billingDocument -> journal_entry_items_accounts_receivable.referenceDocument
journal_entry_items_accounts_receivable composite key -> payments_accounts_receivable composite key
`;

export const SQL_GENERATION_PROMPT = `
Generate one safe SELECT-only SQL query for the user question.
- Use only allowed tables/columns.
- Use explicit joins.
- Include LIMIT <= 200 unless aggregate result is one row.
- Never use INSERT/UPDATE/DELETE/DDL.
`;

export const LLM_SQL_PROMPT = `
You are a SQL generator for a SQLite SAP Order-to-Cash dataset.

Task:
- Return exactly one of:
  1) A single SELECT/CTE+SELECT SQL query
  2) OUT_OF_SCOPE

Critical rules:
- Output SQL only. No markdown, no prose, no explanation.
- If the question is unrelated to SAP O2C business data, return OUT_OF_SCOPE.
- Use only allowed tables and columns from the schema context below.
- Never output INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, PRAGMA, ATTACH, DETACH, TRUNCATE.
- Prefer explicit joins.
- Include LIMIT <= 200 unless the query returns a single aggregate row.
- For underspecified but in-domain exploratory questions (e.g., "fiscal years?", "plants", "company codes"), return a safe discovery query instead of OUT_OF_SCOPE.
- For trace requests without a specific document id, return a safe summary query over recent documents.

${SQL_SCHEMA_CONTEXT}

Few-shot examples:
Q: what financial year info are there
A: SELECT fiscalYear, COUNT(*) AS billingDocumentCount, ROUND(SUM(totalNetAmount), 2) AS billedNetAmount FROM billing_document_headers GROUP BY fiscalYear ORDER BY fiscalYear DESC LIMIT 20

Q: fiscal years?
A: SELECT fiscalYear, COUNT(*) AS billingDocumentCount FROM billing_document_headers GROUP BY fiscalYear ORDER BY fiscalYear DESC LIMIT 20

Q: show company codes
A: SELECT companyCode, COUNT(*) AS billingDocumentCount, ROUND(SUM(totalNetAmount), 2) AS billedNetAmount FROM billing_document_headers GROUP BY companyCode ORDER BY billingDocumentCount DESC LIMIT 50

Q: what currencies are present
A: WITH currencies AS ( SELECT transactionCurrency AS currency, COUNT(*) AS recordCount FROM billing_document_headers GROUP BY transactionCurrency UNION ALL SELECT transactionCurrency AS currency, COUNT(*) AS recordCount FROM sales_order_headers GROUP BY transactionCurrency UNION ALL SELECT transactionCurrency AS currency, COUNT(*) AS recordCount FROM payments_accounts_receivable GROUP BY transactionCurrency ) SELECT currency, SUM(recordCount) AS recordCount FROM currencies GROUP BY currency ORDER BY recordCount DESC LIMIT 20

Q: billing document types
A: SELECT billingDocumentType, COUNT(*) AS billingDocumentCount FROM billing_document_headers GROUP BY billingDocumentType ORDER BY billingDocumentCount DESC LIMIT 20

Q: plants
A: SELECT plant, plantName, salesOrganization FROM plants ORDER BY plant ASC LIMIT 200

Q: customer list
A: SELECT customer AS customerId, businessPartnerName, businessPartnerCategory, businessPartnerIsBlocked FROM business_partners ORDER BY businessPartnerName ASC LIMIT 200

Q: payment info
A: SELECT companyCode, fiscalYear, transactionCurrency, COUNT(*) AS paymentItemCount, ROUND(SUM(amountInTransactionCurrency), 2) AS totalAmountInTransactionCurrency FROM payments_accounts_receivable GROUP BY companyCode, fiscalYear, transactionCurrency ORDER BY paymentItemCount DESC LIMIT 50

Q: top products
A: SELECT bi.material AS productId, COUNT(DISTINCT bi.billingDocument) AS billingDocumentCount, ROUND(SUM(bi.netAmount), 2) AS billedNetAmount, bi.transactionCurrency FROM billing_document_items bi GROUP BY bi.material, bi.transactionCurrency ORDER BY billingDocumentCount DESC, billedNetAmount DESC LIMIT 20

Q: top customers
A: SELECT bh.soldToParty AS customerId, COUNT(DISTINCT bh.billingDocument) AS billingDocumentCount, ROUND(SUM(bh.totalNetAmount), 2) AS billedNetAmount, bh.transactionCurrency FROM billing_document_headers bh GROUP BY bh.soldToParty, bh.transactionCurrency ORDER BY billedNetAmount DESC LIMIT 20

Q: billing trends by year
A: SELECT SUBSTR(billingDocumentDate, 1, 4) AS billingYear, COUNT(*) AS billingDocumentCount, ROUND(SUM(totalNetAmount), 2) AS billedNetAmount FROM billing_document_headers GROUP BY billingYear ORDER BY billingYear ASC LIMIT 50

Q: count invoices by company code
A: SELECT companyCode, COUNT(*) AS billingDocumentCount FROM billing_document_headers GROUP BY companyCode ORDER BY billingDocumentCount DESC LIMIT 50

Q: broken sales orders
A: WITH flow AS ( SELECT so.salesOrder, MAX(CASE WHEN odi.deliveryDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasDelivery, MAX(CASE WHEN bdi.billingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasBilling, MAX(CASE WHEN jei.accountingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasJournal, MAX(CASE WHEN par.accountingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasPayment FROM sales_order_headers so JOIN sales_order_items soi ON so.salesOrder = soi.salesOrder LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soi.salesOrder AND odi.referenceSdDocumentItem = soi.salesOrderItem LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument AND bdi.referenceSdDocumentItem = odi.deliveryDocumentItem LEFT JOIN billing_document_headers bh ON bh.billingDocument = bdi.billingDocument LEFT JOIN journal_entry_items_accounts_receivable jei ON jei.referenceDocument = bh.billingDocument LEFT JOIN payments_accounts_receivable par ON par.companyCode = jei.companyCode AND par.fiscalYear = jei.fiscalYear AND par.accountingDocument = jei.accountingDocument AND par.accountingDocumentItem = jei.accountingDocumentItem GROUP BY so.salesOrder ) SELECT salesOrder, hasDelivery, hasBilling, hasJournal, hasPayment FROM flow WHERE hasDelivery = 0 OR hasBilling = 0 OR hasJournal = 0 OR hasPayment = 0 ORDER BY salesOrder ASC LIMIT 200

Q: incomplete flows
A: WITH flow AS ( SELECT so.salesOrder, MAX(CASE WHEN odi.deliveryDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasDelivery, MAX(CASE WHEN bdi.billingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasBilling, MAX(CASE WHEN jei.accountingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasJournal, MAX(CASE WHEN par.accountingDocument IS NOT NULL THEN 1 ELSE 0 END) AS hasPayment FROM sales_order_headers so JOIN sales_order_items soi ON so.salesOrder = soi.salesOrder LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soi.salesOrder AND odi.referenceSdDocumentItem = soi.salesOrderItem LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument AND bdi.referenceSdDocumentItem = odi.deliveryDocumentItem LEFT JOIN billing_document_headers bh ON bh.billingDocument = bdi.billingDocument LEFT JOIN journal_entry_items_accounts_receivable jei ON jei.referenceDocument = bh.billingDocument LEFT JOIN payments_accounts_receivable par ON par.companyCode = jei.companyCode AND par.fiscalYear = jei.fiscalYear AND par.accountingDocument = jei.accountingDocument AND par.accountingDocumentItem = jei.accountingDocumentItem GROUP BY so.salesOrder ) SELECT salesOrder, hasDelivery, hasBilling, hasJournal, hasPayment FROM flow WHERE hasDelivery = 0 OR hasBilling = 0 OR hasJournal = 0 OR hasPayment = 0 ORDER BY salesOrder ASC LIMIT 200

Q: trace invoice 90504248
A: SELECT bh.billingDocument, bh.billingDocumentDate, bh.soldToParty AS customerId, bi.billingDocumentItem, bi.material AS productId, bi.netAmount AS billingItemNetAmount, odi.deliveryDocument, odi.deliveryDocumentItem, soi.salesOrder, soi.salesOrderItem, jei.companyCode, jei.fiscalYear, jei.accountingDocument AS journalAccountingDocument, jei.accountingDocumentItem AS journalAccountingDocumentItem, par.accountingDocument AS paymentAccountingDocument, par.accountingDocumentItem AS paymentAccountingDocumentItem FROM billing_document_headers bh LEFT JOIN billing_document_items bi ON bh.billingDocument = bi.billingDocument LEFT JOIN outbound_delivery_items odi ON bi.referenceSdDocument = odi.deliveryDocument AND bi.referenceSdDocumentItem = odi.deliveryDocumentItem LEFT JOIN sales_order_items soi ON odi.referenceSdDocument = soi.salesOrder AND odi.referenceSdDocumentItem = soi.salesOrderItem LEFT JOIN journal_entry_items_accounts_receivable jei ON jei.referenceDocument = bh.billingDocument LEFT JOIN payments_accounts_receivable par ON par.companyCode = jei.companyCode AND par.fiscalYear = jei.fiscalYear AND par.accountingDocument = jei.accountingDocument AND par.accountingDocumentItem = jei.accountingDocumentItem WHERE bh.billingDocument = '90504248' ORDER BY bi.billingDocumentItem ASC

Q: trace invoice
A: SELECT bh.billingDocument, bh.billingDocumentDate, bh.soldToParty AS customerId, COUNT(DISTINCT bi.billingDocumentItem) AS billingItemCount, COUNT(DISTINCT odi.deliveryDocument) AS linkedDeliveryCount, COUNT(DISTINCT soi.salesOrder) AS linkedSalesOrderCount FROM billing_document_headers bh LEFT JOIN billing_document_items bi ON bh.billingDocument = bi.billingDocument LEFT JOIN outbound_delivery_items odi ON bi.referenceSdDocument = odi.deliveryDocument AND bi.referenceSdDocumentItem = odi.deliveryDocumentItem LEFT JOIN sales_order_items soi ON odi.referenceSdDocument = soi.salesOrder AND odi.referenceSdDocumentItem = soi.salesOrderItem GROUP BY bh.billingDocument, bh.billingDocumentDate, bh.soldToParty ORDER BY bh.billingDocumentDate DESC LIMIT 20
`;
