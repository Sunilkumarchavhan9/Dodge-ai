export type GraphNodeType =
  | "business_partner"
  | "sales_order"
  | "sales_order_item"
  | "outbound_delivery"
  | "outbound_delivery_item"
  | "billing_document"
  | "billing_document_item"
  | "journal_entry_item"
  | "payment"
  | "product"
  | "plant";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  type: string;
  source: string;
  target: string;
  metadata?: Record<string, unknown>;
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
