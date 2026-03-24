import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const databasePath = path.resolve(currentDir, "dev.db").replace(/\\/g, "/");
  process.env.DATABASE_URL = `file:${databasePath}`;
}

const prisma = new PrismaClient();

const DEFAULT_DATASET_CANDIDATES = [
  process.env.SAP_O2C_DATASET_DIR,
  path.resolve(process.cwd(), "data", "sap-o2c-data"),
  "C:/Users/Admin/Downloads/sap-order-to-cash-dataset/sap-o2c-data",
].filter((value): value is string => Boolean(value));

type JsonObject = Record<string, unknown>;

function resolveDatasetDir(): string {
  for (const candidate of DEFAULT_DATASET_CANDIDATES) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate dataset directory. Set SAP_O2C_DATASET_DIR. Checked: ${DEFAULT_DATASET_CANDIDATES.join(
      ", ",
    )}`,
  );
}

async function readJsonlTable(baseDir: string, tableName: string): Promise<JsonObject[]> {
  const tableDir = path.join(baseDir, tableName);
  if (!fs.existsSync(tableDir)) {
    throw new Error(`Missing table directory: ${tableDir}`);
  }

  const files = fs
    .readdirSync(tableDir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort((a, b) => a.localeCompare(b));

  const rows: JsonObject[] = [];

  for (const file of files) {
    const filePath = path.join(tableDir, file);
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber += 1;
      if (!line.trim()) {
        continue;
      }

      try {
        rows.push(JSON.parse(line) as JsonObject);
      } catch (error) {
        throw new Error(
          `Invalid JSON at ${tableName}/${file}:${lineNumber}: ${(error as Error).message}`,
        );
      }
    }
  }

  return rows;
}

function requiredString(value: unknown, field: string): string {
  const normalized = `${value ?? ""}`.trim();
  if (!normalized) {
    throw new Error(`Missing required field: ${field}`);
  }
  return normalized;
}

function optionalString(value: unknown): string | null {
  const normalized = `${value ?? ""}`.trim();
  return normalized ? normalized : null;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0" || value === "" || value === null || value === undefined) {
    return false;
  }

  throw new Error(`Invalid boolean for ${field}: ${String(value)}`);
}

function requiredDate(value: unknown, field: string): Date {
  const date = optionalDate(value);
  if (!date) {
    throw new Error(`Missing required date field: ${field}`);
  }
  return date;
}

function optionalDate(value: unknown): Date | null {
  const normalized = optionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${normalized}`);
  }

  return parsed;
}

function requiredDecimal(value: unknown, field: string): Prisma.Decimal {
  const normalized = requiredString(value, field);
  return new Prisma.Decimal(normalized);
}

function normalizeNumericCode(value: unknown, field: string): string {
  const normalized = requiredString(value, field);
  if (!/^\d+$/.test(normalized)) {
    return normalized;
  }
  return `${Number.parseInt(normalized, 10)}`;
}

function requiredJson(value: unknown, field: string): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    throw new Error(`Missing required JSON field: ${field}`);
  }
  return value as Prisma.InputJsonValue;
}

async function insertInChunks<T>(
  rows: T[],
  chunkSize: number,
  insert: (chunk: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const result = await insert(chunk);
    total += result.count;
  }
  return total;
}

async function resetDatabase(): Promise<void> {
  await prisma.paymentAccountsReceivable.deleteMany();
  await prisma.journalEntryItemAccountsReceivable.deleteMany();
  await prisma.billingDocumentCancellation.deleteMany();
  await prisma.billingDocumentItem.deleteMany();
  await prisma.billingDocumentHeader.deleteMany();
  await prisma.outboundDeliveryItem.deleteMany();
  await prisma.outboundDeliveryHeader.deleteMany();
  await prisma.salesOrderScheduleLine.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrderHeader.deleteMany();
  await prisma.productStorageLocation.deleteMany();
  await prisma.productPlant.deleteMany();
  await prisma.productDescription.deleteMany();
  await prisma.customerSalesAreaAssignment.deleteMany();
  await prisma.customerCompanyAssignment.deleteMany();
  await prisma.businessPartnerAddress.deleteMany();
  await prisma.product.deleteMany();
  await prisma.plant.deleteMany();
  await prisma.businessPartner.deleteMany();
}

async function seedBusinessPartnerTables(baseDir: string): Promise<void> {
  const businessPartners = (await readJsonlTable(baseDir, "business_partners")).map((row) => ({
    businessPartner: requiredString(row.businessPartner, "businessPartner"),
    customer: requiredString(row.customer, "customer"),
    businessPartnerCategory: requiredString(row.businessPartnerCategory, "businessPartnerCategory"),
    businessPartnerFullName: requiredString(row.businessPartnerFullName, "businessPartnerFullName"),
    businessPartnerGrouping: requiredString(row.businessPartnerGrouping, "businessPartnerGrouping"),
    businessPartnerName: requiredString(row.businessPartnerName, "businessPartnerName"),
    correspondenceLanguage: optionalString(row.correspondenceLanguage),
    createdByUser: requiredString(row.createdByUser, "createdByUser"),
    creationDate: requiredDate(row.creationDate, "creationDate"),
    creationTime: requiredJson(row.creationTime, "creationTime"),
    firstName: optionalString(row.firstName),
    formOfAddress: optionalString(row.formOfAddress),
    industry: optionalString(row.industry),
    lastChangeDate: requiredDate(row.lastChangeDate, "lastChangeDate"),
    lastName: optionalString(row.lastName),
    organizationBpName1: optionalString(row.organizationBpName1),
    organizationBpName2: optionalString(row.organizationBpName2),
    businessPartnerIsBlocked: requiredBoolean(row.businessPartnerIsBlocked, "businessPartnerIsBlocked"),
    isMarkedForArchiving: requiredBoolean(row.isMarkedForArchiving, "isMarkedForArchiving"),
  }));

  await insertInChunks(businessPartners, 500, (chunk) => prisma.businessPartner.createMany({ data: chunk }));

  const addresses = (await readJsonlTable(baseDir, "business_partner_addresses")).map((row) => ({
    businessPartner: requiredString(row.businessPartner, "businessPartner"),
    addressId: requiredString(row.addressId, "addressId"),
    validityStartDate: requiredDate(row.validityStartDate, "validityStartDate"),
    validityEndDate: requiredDate(row.validityEndDate, "validityEndDate"),
    addressUuid: requiredString(row.addressUuid, "addressUuid"),
    addressTimeZone: requiredString(row.addressTimeZone, "addressTimeZone"),
    cityName: optionalString(row.cityName),
    country: requiredString(row.country, "country"),
    poBox: optionalString(row.poBox),
    poBoxDeviatingCityName: optionalString(row.poBoxDeviatingCityName),
    poBoxDeviatingCountry: optionalString(row.poBoxDeviatingCountry),
    poBoxDeviatingRegion: optionalString(row.poBoxDeviatingRegion),
    poBoxIsWithoutNumber: requiredBoolean(row.poBoxIsWithoutNumber, "poBoxIsWithoutNumber"),
    poBoxLobbyName: optionalString(row.poBoxLobbyName),
    poBoxPostalCode: optionalString(row.poBoxPostalCode),
    postalCode: optionalString(row.postalCode),
    region: requiredString(row.region, "region"),
    streetName: optionalString(row.streetName),
    taxJurisdiction: optionalString(row.taxJurisdiction),
    transportZone: optionalString(row.transportZone),
  }));

  await insertInChunks(addresses, 500, (chunk) => prisma.businessPartnerAddress.createMany({ data: chunk }));

  const companyAssignments = (await readJsonlTable(baseDir, "customer_company_assignments")).map((row) => ({
    customer: requiredString(row.customer, "customer"),
    companyCode: requiredString(row.companyCode, "companyCode"),
    accountingClerk: optionalString(row.accountingClerk),
    accountingClerkFaxNumber: optionalString(row.accountingClerkFaxNumber),
    accountingClerkInternetAddress: optionalString(row.accountingClerkInternetAddress),
    accountingClerkPhoneNumber: optionalString(row.accountingClerkPhoneNumber),
    alternativePayerAccount: optionalString(row.alternativePayerAccount),
    paymentBlockingReason: optionalString(row.paymentBlockingReason),
    paymentMethodsList: optionalString(row.paymentMethodsList),
    paymentTerms: optionalString(row.paymentTerms),
    reconciliationAccount: optionalString(row.reconciliationAccount),
    deletionIndicator: requiredBoolean(row.deletionIndicator, "deletionIndicator"),
    customerAccountGroup: requiredString(row.customerAccountGroup, "customerAccountGroup"),
  }));

  await insertInChunks(companyAssignments, 500, (chunk) =>
    prisma.customerCompanyAssignment.createMany({ data: chunk }),
  );

  const salesAssignments = (await readJsonlTable(baseDir, "customer_sales_area_assignments")).map((row) => ({
    customer: requiredString(row.customer, "customer"),
    salesOrganization: requiredString(row.salesOrganization, "salesOrganization"),
    distributionChannel: requiredString(row.distributionChannel, "distributionChannel"),
    division: requiredString(row.division, "division"),
    billingIsBlockedForCustomer: optionalString(row.billingIsBlockedForCustomer),
    completeDeliveryIsDefined: requiredBoolean(row.completeDeliveryIsDefined, "completeDeliveryIsDefined"),
    creditControlArea: optionalString(row.creditControlArea),
    currency: requiredString(row.currency, "currency"),
    customerPaymentTerms: optionalString(row.customerPaymentTerms),
    deliveryPriority: optionalString(row.deliveryPriority),
    incotermsClassification: optionalString(row.incotermsClassification),
    incotermsLocation1: optionalString(row.incotermsLocation1),
    salesGroup: optionalString(row.salesGroup),
    salesOffice: optionalString(row.salesOffice),
    shippingCondition: optionalString(row.shippingCondition),
    slsUnlmtdOvrdelivIsAllwd: requiredBoolean(row.slsUnlmtdOvrdelivIsAllwd, "slsUnlmtdOvrdelivIsAllwd"),
    supplyingPlant: optionalString(row.supplyingPlant),
    salesDistrict: optionalString(row.salesDistrict),
    exchangeRateType: optionalString(row.exchangeRateType),
  }));

  await insertInChunks(salesAssignments, 500, (chunk) =>
    prisma.customerSalesAreaAssignment.createMany({ data: chunk }),
  );
}

async function seedProductAndPlantTables(baseDir: string): Promise<void> {
  const plants = (await readJsonlTable(baseDir, "plants")).map((row) => ({
    plant: requiredString(row.plant, "plant"),
    plantName: requiredString(row.plantName, "plantName"),
    valuationArea: requiredString(row.valuationArea, "valuationArea"),
    plantCustomer: requiredString(row.plantCustomer, "plantCustomer"),
    plantSupplier: optionalString(row.plantSupplier),
    factoryCalendar: requiredString(row.factoryCalendar, "factoryCalendar"),
    defaultPurchasingOrganization: optionalString(row.defaultPurchasingOrganization),
    salesOrganization: requiredString(row.salesOrganization, "salesOrganization"),
    addressId: requiredString(row.addressId, "addressId"),
    plantCategory: optionalString(row.plantCategory),
    distributionChannel: optionalString(row.distributionChannel),
    division: optionalString(row.division),
    language: optionalString(row.language),
    isMarkedForArchiving: requiredBoolean(row.isMarkedForArchiving, "isMarkedForArchiving"),
  }));

  await insertInChunks(plants, 500, (chunk) => prisma.plant.createMany({ data: chunk }));

  const products = (await readJsonlTable(baseDir, "products")).map((row) => ({
    product: requiredString(row.product, "product"),
    productType: requiredString(row.productType, "productType"),
    crossPlantStatus: optionalString(row.crossPlantStatus),
    crossPlantStatusValidityDate: optionalDate(row.crossPlantStatusValidityDate),
    creationDate: requiredDate(row.creationDate, "creationDate"),
    createdByUser: requiredString(row.createdByUser, "createdByUser"),
    lastChangeDate: requiredDate(row.lastChangeDate, "lastChangeDate"),
    lastChangeDateTime: requiredDate(row.lastChangeDateTime, "lastChangeDateTime"),
    isMarkedForDeletion: requiredBoolean(row.isMarkedForDeletion, "isMarkedForDeletion"),
    productOldId: optionalString(row.productOldId),
    grossWeight: requiredDecimal(row.grossWeight, "grossWeight"),
    weightUnit: requiredString(row.weightUnit, "weightUnit"),
    netWeight: requiredDecimal(row.netWeight, "netWeight"),
    productGroup: requiredString(row.productGroup, "productGroup"),
    baseUnit: requiredString(row.baseUnit, "baseUnit"),
    division: requiredString(row.division, "division"),
    industrySector: requiredString(row.industrySector, "industrySector"),
  }));

  await insertInChunks(products, 500, (chunk) => prisma.product.createMany({ data: chunk }));

  const descriptions = (await readJsonlTable(baseDir, "product_descriptions")).map((row) => ({
    product: requiredString(row.product, "product"),
    language: requiredString(row.language, "language"),
    productDescription: requiredString(row.productDescription, "productDescription"),
  }));

  await insertInChunks(descriptions, 1000, (chunk) => prisma.productDescription.createMany({ data: chunk }));

  const productPlants = (await readJsonlTable(baseDir, "product_plants")).map((row) => ({
    product: requiredString(row.product, "product"),
    plant: requiredString(row.plant, "plant"),
    countryOfOrigin: optionalString(row.countryOfOrigin),
    regionOfOrigin: optionalString(row.regionOfOrigin),
    productionInvtryManagedLoc: optionalString(row.productionInvtryManagedLoc),
    availabilityCheckType: optionalString(row.availabilityCheckType),
    fiscalYearVariant: optionalString(row.fiscalYearVariant),
    profitCenter: optionalString(row.profitCenter),
    mrpType: optionalString(row.mrpType),
  }));

  await insertInChunks(productPlants, 1000, (chunk) => prisma.productPlant.createMany({ data: chunk }));

  const storageLocations = (await readJsonlTable(baseDir, "product_storage_locations")).map((row) => ({
    product: requiredString(row.product, "product"),
    plant: requiredString(row.plant, "plant"),
    storageLocation: requiredString(row.storageLocation, "storageLocation"),
    physicalInventoryBlockInd: optionalString(row.physicalInventoryBlockInd),
    dateOfLastPostedCntUnRstrcdStk: optionalDate(row.dateOfLastPostedCntUnRstrcdStk),
  }));

  await insertInChunks(storageLocations, 1000, (chunk) =>
    prisma.productStorageLocation.createMany({ data: chunk }),
  );
}

async function seedSalesAndDeliveryTables(baseDir: string): Promise<void> {
  const salesHeaders = (await readJsonlTable(baseDir, "sales_order_headers")).map((row) => ({
    salesOrder: requiredString(row.salesOrder, "salesOrder"),
    salesOrderType: requiredString(row.salesOrderType, "salesOrderType"),
    salesOrganization: requiredString(row.salesOrganization, "salesOrganization"),
    distributionChannel: requiredString(row.distributionChannel, "distributionChannel"),
    organizationDivision: requiredString(row.organizationDivision, "organizationDivision"),
    salesGroup: optionalString(row.salesGroup),
    salesOffice: optionalString(row.salesOffice),
    soldToParty: requiredString(row.soldToParty, "soldToParty"),
    creationDate: requiredDate(row.creationDate, "creationDate"),
    createdByUser: requiredString(row.createdByUser, "createdByUser"),
    lastChangeDateTime: requiredDate(row.lastChangeDateTime, "lastChangeDateTime"),
    totalNetAmount: requiredDecimal(row.totalNetAmount, "totalNetAmount"),
    overallDeliveryStatus: optionalString(row.overallDeliveryStatus),
    overallOrdReltdBillgStatus: optionalString(row.overallOrdReltdBillgStatus),
    overallSdDocReferenceStatus: optionalString(row.overallSdDocReferenceStatus),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    pricingDate: requiredDate(row.pricingDate, "pricingDate"),
    requestedDeliveryDate: requiredDate(row.requestedDeliveryDate, "requestedDeliveryDate"),
    headerBillingBlockReason: optionalString(row.headerBillingBlockReason),
    deliveryBlockReason: optionalString(row.deliveryBlockReason),
    incotermsClassification: optionalString(row.incotermsClassification),
    incotermsLocation1: optionalString(row.incotermsLocation1),
    customerPaymentTerms: optionalString(row.customerPaymentTerms),
    totalCreditCheckStatus: optionalString(row.totalCreditCheckStatus),
  }));

  await insertInChunks(salesHeaders, 1000, (chunk) => prisma.salesOrderHeader.createMany({ data: chunk }));

  const salesItems = (await readJsonlTable(baseDir, "sales_order_items")).map((row) => ({
    salesOrder: requiredString(row.salesOrder, "salesOrder"),
    salesOrderItem: normalizeNumericCode(row.salesOrderItem, "salesOrderItem"),
    salesOrderItemCategory: requiredString(row.salesOrderItemCategory, "salesOrderItemCategory"),
    material: requiredString(row.material, "material"),
    requestedQuantity: requiredDecimal(row.requestedQuantity, "requestedQuantity"),
    requestedQuantityUnit: requiredString(row.requestedQuantityUnit, "requestedQuantityUnit"),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    netAmount: requiredDecimal(row.netAmount, "netAmount"),
    materialGroup: optionalString(row.materialGroup),
    productionPlant: requiredString(row.productionPlant, "productionPlant"),
    storageLocation: requiredString(row.storageLocation, "storageLocation"),
    salesDocumentRjcnReason: optionalString(row.salesDocumentRjcnReason),
    itemBillingBlockReason: optionalString(row.itemBillingBlockReason),
  }));

  await insertInChunks(salesItems, 1000, (chunk) => prisma.salesOrderItem.createMany({ data: chunk }));

  const scheduleLines = (await readJsonlTable(baseDir, "sales_order_schedule_lines")).map((row) => ({
    salesOrder: requiredString(row.salesOrder, "salesOrder"),
    salesOrderItem: normalizeNumericCode(row.salesOrderItem, "salesOrderItem"),
    scheduleLine: normalizeNumericCode(row.scheduleLine, "scheduleLine"),
    confirmedDeliveryDate: optionalDate(row.confirmedDeliveryDate),
    orderQuantityUnit: requiredString(row.orderQuantityUnit, "orderQuantityUnit"),
    confdOrderQtyByMatlAvailCheck: requiredDecimal(
      row.confdOrderQtyByMatlAvailCheck,
      "confdOrderQtyByMatlAvailCheck",
    ),
  }));

  await insertInChunks(scheduleLines, 1000, (chunk) => prisma.salesOrderScheduleLine.createMany({ data: chunk }));

  const deliveryHeaders = (await readJsonlTable(baseDir, "outbound_delivery_headers")).map((row) => ({
    deliveryDocument: requiredString(row.deliveryDocument, "deliveryDocument"),
    actualGoodsMovementDate: optionalDate(row.actualGoodsMovementDate),
    actualGoodsMovementTime: requiredJson(row.actualGoodsMovementTime, "actualGoodsMovementTime"),
    creationDate: requiredDate(row.creationDate, "creationDate"),
    creationTime: requiredJson(row.creationTime, "creationTime"),
    deliveryBlockReason: optionalString(row.deliveryBlockReason),
    hdrGeneralIncompletionStatus: optionalString(row.hdrGeneralIncompletionStatus),
    headerBillingBlockReason: optionalString(row.headerBillingBlockReason),
    lastChangeDate: optionalDate(row.lastChangeDate),
    overallGoodsMovementStatus: optionalString(row.overallGoodsMovementStatus),
    overallPickingStatus: optionalString(row.overallPickingStatus),
    overallProofOfDeliveryStatus: optionalString(row.overallProofOfDeliveryStatus),
    shippingPoint: optionalString(row.shippingPoint),
  }));

  await insertInChunks(deliveryHeaders, 1000, (chunk) =>
    prisma.outboundDeliveryHeader.createMany({ data: chunk }),
  );

  const deliveryItems = (await readJsonlTable(baseDir, "outbound_delivery_items")).map((row) => ({
    deliveryDocument: requiredString(row.deliveryDocument, "deliveryDocument"),
    deliveryDocumentItem: normalizeNumericCode(row.deliveryDocumentItem, "deliveryDocumentItem"),
    actualDeliveryQuantity: requiredDecimal(row.actualDeliveryQuantity, "actualDeliveryQuantity"),
    batch: optionalString(row.batch),
    deliveryQuantityUnit: requiredString(row.deliveryQuantityUnit, "deliveryQuantityUnit"),
    itemBillingBlockReason: optionalString(row.itemBillingBlockReason),
    lastChangeDate: optionalDate(row.lastChangeDate),
    plant: requiredString(row.plant, "plant"),
    referenceSdDocument: requiredString(row.referenceSdDocument, "referenceSdDocument"),
    referenceSdDocumentItem: normalizeNumericCode(row.referenceSdDocumentItem, "referenceSdDocumentItem"),
    storageLocation: requiredString(row.storageLocation, "storageLocation"),
  }));

  await insertInChunks(deliveryItems, 1000, (chunk) => prisma.outboundDeliveryItem.createMany({ data: chunk }));
}

async function seedBillingAndArTables(baseDir: string): Promise<void> {
  const billingHeaders = (await readJsonlTable(baseDir, "billing_document_headers")).map((row) => ({
    billingDocument: requiredString(row.billingDocument, "billingDocument"),
    billingDocumentType: requiredString(row.billingDocumentType, "billingDocumentType"),
    creationDate: requiredDate(row.creationDate, "creationDate"),
    creationTime: requiredJson(row.creationTime, "creationTime"),
    lastChangeDateTime: requiredDate(row.lastChangeDateTime, "lastChangeDateTime"),
    billingDocumentDate: requiredDate(row.billingDocumentDate, "billingDocumentDate"),
    billingDocumentIsCancelled: requiredBoolean(row.billingDocumentIsCancelled, "billingDocumentIsCancelled"),
    cancelledBillingDocument: optionalString(row.cancelledBillingDocument),
    totalNetAmount: requiredDecimal(row.totalNetAmount, "totalNetAmount"),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    companyCode: requiredString(row.companyCode, "companyCode"),
    fiscalYear: requiredString(row.fiscalYear, "fiscalYear"),
    accountingDocument: requiredString(row.accountingDocument, "accountingDocument"),
    soldToParty: requiredString(row.soldToParty, "soldToParty"),
  }));

  await insertInChunks(billingHeaders, 1000, (chunk) => prisma.billingDocumentHeader.createMany({ data: chunk }));

  const billingItems = (await readJsonlTable(baseDir, "billing_document_items")).map((row) => ({
    billingDocument: requiredString(row.billingDocument, "billingDocument"),
    billingDocumentItem: normalizeNumericCode(row.billingDocumentItem, "billingDocumentItem"),
    material: requiredString(row.material, "material"),
    billingQuantity: requiredDecimal(row.billingQuantity, "billingQuantity"),
    billingQuantityUnit: requiredString(row.billingQuantityUnit, "billingQuantityUnit"),
    netAmount: requiredDecimal(row.netAmount, "netAmount"),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    referenceSdDocument: requiredString(row.referenceSdDocument, "referenceSdDocument"),
    referenceSdDocumentItem: normalizeNumericCode(row.referenceSdDocumentItem, "referenceSdDocumentItem"),
  }));

  await insertInChunks(billingItems, 1000, (chunk) => prisma.billingDocumentItem.createMany({ data: chunk }));

  const cancellationRows = (await readJsonlTable(baseDir, "billing_document_cancellations")).map((row) => ({
    billingDocument: requiredString(row.billingDocument, "billingDocument"),
    billingDocumentType: requiredString(row.billingDocumentType, "billingDocumentType"),
    creationDate: requiredDate(row.creationDate, "creationDate"),
    creationTime: requiredJson(row.creationTime, "creationTime"),
    lastChangeDateTime: requiredDate(row.lastChangeDateTime, "lastChangeDateTime"),
    billingDocumentDate: requiredDate(row.billingDocumentDate, "billingDocumentDate"),
    billingDocumentIsCancelled: requiredBoolean(row.billingDocumentIsCancelled, "billingDocumentIsCancelled"),
    cancelledBillingDocument: optionalString(row.cancelledBillingDocument),
    totalNetAmount: requiredDecimal(row.totalNetAmount, "totalNetAmount"),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    companyCode: requiredString(row.companyCode, "companyCode"),
    fiscalYear: requiredString(row.fiscalYear, "fiscalYear"),
    accountingDocument: requiredString(row.accountingDocument, "accountingDocument"),
    soldToParty: requiredString(row.soldToParty, "soldToParty"),
  }));

  await insertInChunks(cancellationRows, 500, (chunk) =>
    prisma.billingDocumentCancellation.createMany({ data: chunk }),
  );

  const journalRows = (await readJsonlTable(baseDir, "journal_entry_items_accounts_receivable")).map((row) => ({
    companyCode: requiredString(row.companyCode, "companyCode"),
    fiscalYear: requiredString(row.fiscalYear, "fiscalYear"),
    accountingDocument: requiredString(row.accountingDocument, "accountingDocument"),
    accountingDocumentItem: normalizeNumericCode(row.accountingDocumentItem, "accountingDocumentItem"),
    glAccount: requiredString(row.glAccount, "glAccount"),
    referenceDocument: optionalString(row.referenceDocument),
    costCenter: optionalString(row.costCenter),
    profitCenter: optionalString(row.profitCenter),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    amountInTransactionCurrency: requiredDecimal(
      row.amountInTransactionCurrency,
      "amountInTransactionCurrency",
    ),
    companyCodeCurrency: requiredString(row.companyCodeCurrency, "companyCodeCurrency"),
    amountInCompanyCodeCurrency: requiredDecimal(
      row.amountInCompanyCodeCurrency,
      "amountInCompanyCodeCurrency",
    ),
    postingDate: requiredDate(row.postingDate, "postingDate"),
    documentDate: requiredDate(row.documentDate, "documentDate"),
    accountingDocumentType: requiredString(row.accountingDocumentType, "accountingDocumentType"),
    assignmentReference: optionalString(row.assignmentReference),
    lastChangeDateTime: requiredDate(row.lastChangeDateTime, "lastChangeDateTime"),
    customer: requiredString(row.customer, "customer"),
    financialAccountType: requiredString(row.financialAccountType, "financialAccountType"),
    clearingDate: optionalDate(row.clearingDate),
    clearingAccountingDocument: optionalString(row.clearingAccountingDocument),
    clearingDocFiscalYear: optionalString(row.clearingDocFiscalYear),
  }));

  await insertInChunks(journalRows, 1000, (chunk) =>
    prisma.journalEntryItemAccountsReceivable.createMany({ data: chunk }),
  );

  const paymentRows = (await readJsonlTable(baseDir, "payments_accounts_receivable")).map((row) => ({
    companyCode: requiredString(row.companyCode, "companyCode"),
    fiscalYear: requiredString(row.fiscalYear, "fiscalYear"),
    accountingDocument: requiredString(row.accountingDocument, "accountingDocument"),
    accountingDocumentItem: normalizeNumericCode(row.accountingDocumentItem, "accountingDocumentItem"),
    clearingDate: optionalDate(row.clearingDate),
    clearingAccountingDocument: optionalString(row.clearingAccountingDocument),
    clearingDocFiscalYear: optionalString(row.clearingDocFiscalYear),
    amountInTransactionCurrency: requiredDecimal(
      row.amountInTransactionCurrency,
      "amountInTransactionCurrency",
    ),
    transactionCurrency: requiredString(row.transactionCurrency, "transactionCurrency"),
    amountInCompanyCodeCurrency: requiredDecimal(
      row.amountInCompanyCodeCurrency,
      "amountInCompanyCodeCurrency",
    ),
    companyCodeCurrency: requiredString(row.companyCodeCurrency, "companyCodeCurrency"),
    customer: requiredString(row.customer, "customer"),
    invoiceReference: optionalString(row.invoiceReference),
    invoiceReferenceFiscalYear: optionalString(row.invoiceReferenceFiscalYear),
    salesDocument: optionalString(row.salesDocument),
    salesDocumentItem: optionalString(row.salesDocumentItem),
    postingDate: requiredDate(row.postingDate, "postingDate"),
    documentDate: requiredDate(row.documentDate, "documentDate"),
    assignmentReference: optionalString(row.assignmentReference),
    glAccount: requiredString(row.glAccount, "glAccount"),
    financialAccountType: requiredString(row.financialAccountType, "financialAccountType"),
    profitCenter: optionalString(row.profitCenter),
    costCenter: optionalString(row.costCenter),
  }));

  await insertInChunks(paymentRows, 1000, (chunk) =>
    prisma.paymentAccountsReceivable.createMany({ data: chunk }),
  );
}

async function main(): Promise<void> {
  const datasetDir = resolveDatasetDir();

  console.log(`Seeding from dataset: ${datasetDir}`);
  await resetDatabase();

  await seedBusinessPartnerTables(datasetDir);
  await seedProductAndPlantTables(datasetDir);
  await seedSalesAndDeliveryTables(datasetDir);
  await seedBillingAndArTables(datasetDir);

  console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
