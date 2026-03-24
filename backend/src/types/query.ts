export type QueryRejectReason = "out_of_scope" | "unsafe_query" | "no_data";

export type QueryAcceptedResponse = {
  accepted: true;
  sql: string;
  rows: Record<string, unknown>[];
  answer: string;
  highlights: string[];
};

export type QueryRejectedResponse = {
  accepted: false;
  reason: QueryRejectReason;
};

export type QueryResponse = QueryAcceptedResponse | QueryRejectedResponse;
