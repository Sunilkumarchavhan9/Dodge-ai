import { prisma } from "../lib/prisma";
import type { GraphEdge, GraphNode, GraphNodeType, GraphPayload } from "../types/graph";

const nodeId = {
  businessPartner: (customer: string) => `business_partner:${customer}`,
  salesOrder: (salesOrder: string) => `sales_order:${salesOrder}`,
  salesOrderItem: (salesOrder: string, salesOrderItem: string) =>
    `sales_order_item:${salesOrder}|${salesOrderItem}`,
  outboundDelivery: (deliveryDocument: string) => `outbound_delivery:${deliveryDocument}`,
  outboundDeliveryItem: (deliveryDocument: string, deliveryDocumentItem: string) =>
    `outbound_delivery_item:${deliveryDocument}|${deliveryDocumentItem}`,
  billingDocument: (billingDocument: string) => `billing_document:${billingDocument}`,
  billingDocumentItem: (billingDocument: string, billingDocumentItem: string) =>
    `billing_document_item:${billingDocument}|${billingDocumentItem}`,
  journalEntryItem: (
    companyCode: string,
    fiscalYear: string,
    accountingDocument: string,
    accountingDocumentItem: string,
  ) =>
    `journal_entry_item:${companyCode}|${fiscalYear}|${accountingDocument}|${accountingDocumentItem}`,
  payment: (
    companyCode: string,
    fiscalYear: string,
    accountingDocument: string,
    accountingDocumentItem: string,
  ) => `payment:${companyCode}|${fiscalYear}|${accountingDocument}|${accountingDocumentItem}`,
  product: (product: string) => `product:${product}`,
  plant: (plant: string) => `plant:${plant}`,
};

type ParsedNodeId = {
  type: GraphNodeType;
  parts: string[];
};

function parseNodeId(id: string): ParsedNodeId | null {
  const separatorIndex = id.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const type = id.slice(0, separatorIndex) as GraphNodeType;
  const rawParts = id.slice(separatorIndex + 1);
  if (!rawParts) {
    return null;
  }

  const parts = rawParts.split("|").filter((part) => part.length > 0);
  return { type, parts };
}

function pushEdge(
  edgeMap: Map<string, GraphEdge>,
  type: string,
  source: string,
  target: string,
  metadata?: Record<string, unknown>,
): void {
  const id = `${type}:${source}->${target}`;
  if (edgeMap.has(id)) {
    return;
  }

  edgeMap.set(id, {
    id,
    type,
    source,
    target,
    metadata,
  });
}

export async function getGraphPayload(): Promise<GraphPayload> {
  const [
    businessPartners,
    salesOrderHeaders,
    salesOrderItems,
    outboundDeliveryHeaders,
    outboundDeliveryItems,
    billingDocumentHeaders,
    billingDocumentItems,
    journalEntryItems,
    payments,
    products,
    plants,
  ] = await Promise.all([
    prisma.businessPartner.findMany({
      select: {
        customer: true,
        businessPartnerName: true,
        businessPartnerCategory: true,
        businessPartnerIsBlocked: true,
      },
    }),
    prisma.salesOrderHeader.findMany({
      select: {
        salesOrder: true,
        soldToParty: true,
        salesOrderType: true,
        creationDate: true,
        totalNetAmount: true,
        transactionCurrency: true,
      },
    }),
    prisma.salesOrderItem.findMany({
      select: {
        salesOrder: true,
        salesOrderItem: true,
        material: true,
        requestedQuantity: true,
        requestedQuantityUnit: true,
        netAmount: true,
        productionPlant: true,
        storageLocation: true,
      },
    }),
    prisma.outboundDeliveryHeader.findMany({
      select: {
        deliveryDocument: true,
        creationDate: true,
        shippingPoint: true,
        overallGoodsMovementStatus: true,
      },
    }),
    prisma.outboundDeliveryItem.findMany({
      select: {
        deliveryDocument: true,
        deliveryDocumentItem: true,
        referenceSdDocument: true,
        referenceSdDocumentItem: true,
        actualDeliveryQuantity: true,
        deliveryQuantityUnit: true,
        plant: true,
        storageLocation: true,
      },
    }),
    prisma.billingDocumentHeader.findMany({
      select: {
        billingDocument: true,
        soldToParty: true,
        billingDocumentDate: true,
        billingDocumentType: true,
        billingDocumentIsCancelled: true,
        cancelledBillingDocument: true,
        totalNetAmount: true,
        transactionCurrency: true,
      },
    }),
    prisma.billingDocumentItem.findMany({
      select: {
        billingDocument: true,
        billingDocumentItem: true,
        material: true,
        netAmount: true,
        billingQuantity: true,
        billingQuantityUnit: true,
        referenceSdDocument: true,
        referenceSdDocumentItem: true,
      },
    }),
    prisma.journalEntryItemAccountsReceivable.findMany({
      select: {
        companyCode: true,
        fiscalYear: true,
        accountingDocument: true,
        accountingDocumentItem: true,
        customer: true,
        referenceDocument: true,
        postingDate: true,
        amountInTransactionCurrency: true,
        transactionCurrency: true,
      },
    }),
    prisma.paymentAccountsReceivable.findMany({
      select: {
        companyCode: true,
        fiscalYear: true,
        accountingDocument: true,
        accountingDocumentItem: true,
        customer: true,
        postingDate: true,
        amountInTransactionCurrency: true,
        transactionCurrency: true,
      },
    }),
    prisma.product.findMany({
      select: {
        product: true,
        productType: true,
        productGroup: true,
        baseUnit: true,
        descriptions: {
          where: { language: "EN" },
          take: 1,
          select: { productDescription: true },
        },
      },
    }),
    prisma.plant.findMany({
      select: {
        plant: true,
        plantName: true,
        salesOrganization: true,
      },
    }),
  ]);

  const nodes: GraphNode[] = [];

  for (const bp of businessPartners) {
    nodes.push({
      id: nodeId.businessPartner(bp.customer),
      type: "business_partner",
      label: bp.businessPartnerName,
      metadata: {
        customer: bp.customer,
        businessPartnerCategory: bp.businessPartnerCategory,
        businessPartnerIsBlocked: bp.businessPartnerIsBlocked,
      },
    });
  }

  for (const so of salesOrderHeaders) {
    nodes.push({
      id: nodeId.salesOrder(so.salesOrder),
      type: "sales_order",
      label: so.salesOrder,
      metadata: {
        salesOrderType: so.salesOrderType,
        soldToParty: so.soldToParty,
        creationDate: so.creationDate,
        totalNetAmount: so.totalNetAmount,
        transactionCurrency: so.transactionCurrency,
      },
    });
  }

  for (const item of salesOrderItems) {
    nodes.push({
      id: nodeId.salesOrderItem(item.salesOrder, item.salesOrderItem),
      type: "sales_order_item",
      label: `${item.salesOrder}-${item.salesOrderItem}`,
      metadata: {
        salesOrder: item.salesOrder,
        salesOrderItem: item.salesOrderItem,
        material: item.material,
        requestedQuantity: item.requestedQuantity,
        requestedQuantityUnit: item.requestedQuantityUnit,
        netAmount: item.netAmount,
        productionPlant: item.productionPlant,
        storageLocation: item.storageLocation,
      },
    });
  }

  for (const delivery of outboundDeliveryHeaders) {
    nodes.push({
      id: nodeId.outboundDelivery(delivery.deliveryDocument),
      type: "outbound_delivery",
      label: delivery.deliveryDocument,
      metadata: {
        deliveryDocument: delivery.deliveryDocument,
        creationDate: delivery.creationDate,
        shippingPoint: delivery.shippingPoint,
        overallGoodsMovementStatus: delivery.overallGoodsMovementStatus,
      },
    });
  }

  for (const item of outboundDeliveryItems) {
    nodes.push({
      id: nodeId.outboundDeliveryItem(item.deliveryDocument, item.deliveryDocumentItem),
      type: "outbound_delivery_item",
      label: `${item.deliveryDocument}-${item.deliveryDocumentItem}`,
      metadata: {
        deliveryDocument: item.deliveryDocument,
        deliveryDocumentItem: item.deliveryDocumentItem,
        referenceSdDocument: item.referenceSdDocument,
        referenceSdDocumentItem: item.referenceSdDocumentItem,
        actualDeliveryQuantity: item.actualDeliveryQuantity,
        deliveryQuantityUnit: item.deliveryQuantityUnit,
        plant: item.plant,
        storageLocation: item.storageLocation,
      },
    });
  }

  for (const billing of billingDocumentHeaders) {
    nodes.push({
      id: nodeId.billingDocument(billing.billingDocument),
      type: "billing_document",
      label: billing.billingDocument,
      metadata: {
        soldToParty: billing.soldToParty,
        billingDocumentDate: billing.billingDocumentDate,
        billingDocumentType: billing.billingDocumentType,
        billingDocumentIsCancelled: billing.billingDocumentIsCancelled,
        cancelledBillingDocument: billing.cancelledBillingDocument,
        totalNetAmount: billing.totalNetAmount,
        transactionCurrency: billing.transactionCurrency,
      },
    });
  }

  for (const item of billingDocumentItems) {
    nodes.push({
      id: nodeId.billingDocumentItem(item.billingDocument, item.billingDocumentItem),
      type: "billing_document_item",
      label: `${item.billingDocument}-${item.billingDocumentItem}`,
      metadata: {
        billingDocument: item.billingDocument,
        billingDocumentItem: item.billingDocumentItem,
        material: item.material,
        netAmount: item.netAmount,
        billingQuantity: item.billingQuantity,
        billingQuantityUnit: item.billingQuantityUnit,
        referenceSdDocument: item.referenceSdDocument,
        referenceSdDocumentItem: item.referenceSdDocumentItem,
      },
    });
  }

  for (const journal of journalEntryItems) {
    nodes.push({
      id: nodeId.journalEntryItem(
        journal.companyCode,
        journal.fiscalYear,
        journal.accountingDocument,
        journal.accountingDocumentItem,
      ),
      type: "journal_entry_item",
      label: `${journal.accountingDocument}-${journal.accountingDocumentItem}`,
      metadata: {
        companyCode: journal.companyCode,
        fiscalYear: journal.fiscalYear,
        accountingDocument: journal.accountingDocument,
        accountingDocumentItem: journal.accountingDocumentItem,
        customer: journal.customer,
        referenceDocument: journal.referenceDocument,
        postingDate: journal.postingDate,
        amountInTransactionCurrency: journal.amountInTransactionCurrency,
        transactionCurrency: journal.transactionCurrency,
      },
    });
  }

  for (const payment of payments) {
    nodes.push({
      id: nodeId.payment(
        payment.companyCode,
        payment.fiscalYear,
        payment.accountingDocument,
        payment.accountingDocumentItem,
      ),
      type: "payment",
      label: `${payment.accountingDocument}-${payment.accountingDocumentItem}`,
      metadata: {
        companyCode: payment.companyCode,
        fiscalYear: payment.fiscalYear,
        accountingDocument: payment.accountingDocument,
        accountingDocumentItem: payment.accountingDocumentItem,
        customer: payment.customer,
        postingDate: payment.postingDate,
        amountInTransactionCurrency: payment.amountInTransactionCurrency,
        transactionCurrency: payment.transactionCurrency,
      },
    });
  }

  for (const product of products) {
    nodes.push({
      id: nodeId.product(product.product),
      type: "product",
      label: product.descriptions[0]?.productDescription ?? product.product,
      metadata: {
        product: product.product,
        productType: product.productType,
        productGroup: product.productGroup,
        baseUnit: product.baseUnit,
        productDescription: product.descriptions[0]?.productDescription ?? null,
      },
    });
  }

  for (const plant of plants) {
    nodes.push({
      id: nodeId.plant(plant.plant),
      type: "plant",
      label: plant.plantName,
      metadata: {
        plant: plant.plant,
        plantName: plant.plantName,
        salesOrganization: plant.salesOrganization,
      },
    });
  }

  const edgeMap = new Map<string, GraphEdge>();

  for (const salesOrder of salesOrderHeaders) {
    pushEdge(
      edgeMap,
      "placed_order",
      nodeId.businessPartner(salesOrder.soldToParty),
      nodeId.salesOrder(salesOrder.salesOrder),
    );
  }

  for (const item of salesOrderItems) {
    pushEdge(
      edgeMap,
      "sales_order_has_item",
      nodeId.salesOrder(item.salesOrder),
      nodeId.salesOrderItem(item.salesOrder, item.salesOrderItem),
    );

    pushEdge(
      edgeMap,
      "sales_item_product",
      nodeId.salesOrderItem(item.salesOrder, item.salesOrderItem),
      nodeId.product(item.material),
    );

    pushEdge(
      edgeMap,
      "sales_item_plant",
      nodeId.salesOrderItem(item.salesOrder, item.salesOrderItem),
      nodeId.plant(item.productionPlant),
    );
  }

  for (const delivery of outboundDeliveryItems) {
    pushEdge(
      edgeMap,
      "outbound_delivery_has_item",
      nodeId.outboundDelivery(delivery.deliveryDocument),
      nodeId.outboundDeliveryItem(delivery.deliveryDocument, delivery.deliveryDocumentItem),
    );

    pushEdge(
      edgeMap,
      "outbound_item_plant",
      nodeId.outboundDeliveryItem(delivery.deliveryDocument, delivery.deliveryDocumentItem),
      nodeId.plant(delivery.plant),
    );

    pushEdge(
      edgeMap,
      "outbound_item_sales_item",
      nodeId.outboundDeliveryItem(delivery.deliveryDocument, delivery.deliveryDocumentItem),
      nodeId.salesOrderItem(delivery.referenceSdDocument, delivery.referenceSdDocumentItem),
    );
  }

  for (const billing of billingDocumentHeaders) {
    pushEdge(
      edgeMap,
      "billing_document_customer",
      nodeId.billingDocument(billing.billingDocument),
      nodeId.businessPartner(billing.soldToParty),
    );

    if (billing.cancelledBillingDocument) {
      pushEdge(
        edgeMap,
        "billing_document_cancels",
        nodeId.billingDocument(billing.billingDocument),
        nodeId.billingDocument(billing.cancelledBillingDocument),
      );
    }
  }

  for (const item of billingDocumentItems) {
    pushEdge(
      edgeMap,
      "billing_document_has_item",
      nodeId.billingDocument(item.billingDocument),
      nodeId.billingDocumentItem(item.billingDocument, item.billingDocumentItem),
    );

    pushEdge(
      edgeMap,
      "billing_item_product",
      nodeId.billingDocumentItem(item.billingDocument, item.billingDocumentItem),
      nodeId.product(item.material),
    );

    pushEdge(
      edgeMap,
      "billing_item_outbound_item",
      nodeId.billingDocumentItem(item.billingDocument, item.billingDocumentItem),
      nodeId.outboundDeliveryItem(item.referenceSdDocument, item.referenceSdDocumentItem),
    );
  }

  const paymentByComposite = new Map<string, string>();
  for (const payment of payments) {
    const composite = `${payment.companyCode}|${payment.fiscalYear}|${payment.accountingDocument}|${payment.accountingDocumentItem}`;
    const paymentId = nodeId.payment(
      payment.companyCode,
      payment.fiscalYear,
      payment.accountingDocument,
      payment.accountingDocumentItem,
    );
    paymentByComposite.set(composite, paymentId);

    pushEdge(
      edgeMap,
      "payment_customer",
      paymentId,
      nodeId.businessPartner(payment.customer),
    );
  }

  for (const journal of journalEntryItems) {
    const journalId = nodeId.journalEntryItem(
      journal.companyCode,
      journal.fiscalYear,
      journal.accountingDocument,
      journal.accountingDocumentItem,
    );

    pushEdge(
      edgeMap,
      "journal_customer",
      journalId,
      nodeId.businessPartner(journal.customer),
    );

    if (journal.referenceDocument) {
      pushEdge(
        edgeMap,
        "billing_document_journal_item",
        nodeId.billingDocument(journal.referenceDocument),
        journalId,
      );
    }

    const composite = `${journal.companyCode}|${journal.fiscalYear}|${journal.accountingDocument}|${journal.accountingDocumentItem}`;
    const paymentId = paymentByComposite.get(composite);
    if (paymentId) {
      pushEdge(edgeMap, "journal_cleared_by_payment", journalId, paymentId);
    }
  }

  const edges = [...edgeMap.values()];

  return {
    nodes,
    edges,
  };
}

export async function getNodeDetailsById(id: string): Promise<GraphNode | null> {
  const parsed = parseNodeId(id);
  if (!parsed) {
    return null;
  }

  switch (parsed.type) {
    case "business_partner": {
      const [customer] = parsed.parts;
      if (!customer) return null;

      const row = await prisma.businessPartner.findUnique({
        where: { customer },
      });

      if (!row) return null;

      return {
        id,
        type: "business_partner",
        label: row.businessPartnerName,
        metadata: row,
      };
    }

    case "sales_order": {
      const [salesOrder] = parsed.parts;
      if (!salesOrder) return null;

      const row = await prisma.salesOrderHeader.findUnique({ where: { salesOrder } });
      if (!row) return null;

      return {
        id,
        type: "sales_order",
        label: row.salesOrder,
        metadata: row,
      };
    }

    case "sales_order_item": {
      const [salesOrder, salesOrderItem] = parsed.parts;
      if (!salesOrder || !salesOrderItem) return null;

      const row = await prisma.salesOrderItem.findUnique({
        where: {
          salesOrder_salesOrderItem: {
            salesOrder,
            salesOrderItem,
          },
        },
      });

      if (!row) return null;

      return {
        id,
        type: "sales_order_item",
        label: `${row.salesOrder}-${row.salesOrderItem}`,
        metadata: row,
      };
    }

    case "outbound_delivery": {
      const [deliveryDocument] = parsed.parts;
      if (!deliveryDocument) return null;

      const row = await prisma.outboundDeliveryHeader.findUnique({
        where: { deliveryDocument },
      });

      if (!row) return null;

      return {
        id,
        type: "outbound_delivery",
        label: row.deliveryDocument,
        metadata: row,
      };
    }

    case "outbound_delivery_item": {
      const [deliveryDocument, deliveryDocumentItem] = parsed.parts;
      if (!deliveryDocument || !deliveryDocumentItem) return null;

      const row = await prisma.outboundDeliveryItem.findUnique({
        where: {
          deliveryDocument_deliveryDocumentItem: {
            deliveryDocument,
            deliveryDocumentItem,
          },
        },
      });

      if (!row) return null;

      return {
        id,
        type: "outbound_delivery_item",
        label: `${row.deliveryDocument}-${row.deliveryDocumentItem}`,
        metadata: row,
      };
    }

    case "billing_document": {
      const [billingDocument] = parsed.parts;
      if (!billingDocument) return null;

      const row = await prisma.billingDocumentHeader.findUnique({
        where: { billingDocument },
      });

      if (!row) return null;

      return {
        id,
        type: "billing_document",
        label: row.billingDocument,
        metadata: row,
      };
    }

    case "billing_document_item": {
      const [billingDocument, billingDocumentItem] = parsed.parts;
      if (!billingDocument || !billingDocumentItem) return null;

      const row = await prisma.billingDocumentItem.findUnique({
        where: {
          billingDocument_billingDocumentItem: {
            billingDocument,
            billingDocumentItem,
          },
        },
      });

      if (!row) return null;

      return {
        id,
        type: "billing_document_item",
        label: `${row.billingDocument}-${row.billingDocumentItem}`,
        metadata: row,
      };
    }

    case "journal_entry_item": {
      const [companyCode, fiscalYear, accountingDocument, accountingDocumentItem] = parsed.parts;
      if (!companyCode || !fiscalYear || !accountingDocument || !accountingDocumentItem) {
        return null;
      }

      const row = await prisma.journalEntryItemAccountsReceivable.findUnique({
        where: {
          companyCode_fiscalYear_accountingDocument_accountingDocumentItem: {
            companyCode,
            fiscalYear,
            accountingDocument,
            accountingDocumentItem,
          },
        },
      });

      if (!row) return null;

      return {
        id,
        type: "journal_entry_item",
        label: `${row.accountingDocument}-${row.accountingDocumentItem}`,
        metadata: row,
      };
    }

    case "payment": {
      const [companyCode, fiscalYear, accountingDocument, accountingDocumentItem] = parsed.parts;
      if (!companyCode || !fiscalYear || !accountingDocument || !accountingDocumentItem) {
        return null;
      }

      const row = await prisma.paymentAccountsReceivable.findUnique({
        where: {
          companyCode_fiscalYear_accountingDocument_accountingDocumentItem: {
            companyCode,
            fiscalYear,
            accountingDocument,
            accountingDocumentItem,
          },
        },
      });

      if (!row) return null;

      return {
        id,
        type: "payment",
        label: `${row.accountingDocument}-${row.accountingDocumentItem}`,
        metadata: row,
      };
    }

    case "product": {
      const [product] = parsed.parts;
      if (!product) return null;

      const row = await prisma.product.findUnique({
        where: { product },
        include: {
          descriptions: {
            where: { language: "EN" },
            take: 1,
          },
        },
      });

      if (!row) return null;

      return {
        id,
        type: "product",
        label: row.descriptions[0]?.productDescription ?? row.product,
        metadata: {
          ...row,
          productDescription: row.descriptions[0]?.productDescription ?? null,
        },
      };
    }

    case "plant": {
      const [plant] = parsed.parts;
      if (!plant) return null;

      const row = await prisma.plant.findUnique({ where: { plant } });
      if (!row) return null;

      return {
        id,
        type: "plant",
        label: row.plantName,
        metadata: row,
      };
    }

    default:
      return null;
  }
}
