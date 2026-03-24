import { Router } from "express";

import { getGraphPayload } from "../services/graph.service";

const graphRouter = Router();

graphRouter.get("/api/graph", async (_req, res) => {
  try {
    const payload = await getGraphPayload();
    res.json({
      nodes: payload.nodes,
      edges: payload.edges,
    });
  } catch (error) {
    console.error("Failed to build graph payload", error);
    res.status(500).json({
      error: "graph_generation_failed",
      message: "Could not build graph payload.",
    });
  }
});

export default graphRouter;
