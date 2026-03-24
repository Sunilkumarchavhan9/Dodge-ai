import { Router } from "express";

import { getNodeDetailsById } from "../services/graph.service";

const nodeRouter = Router();

nodeRouter.get("/api/node/:id", async (req, res) => {
  try {
    const nodeId = decodeURIComponent(req.params.id);
    const node = await getNodeDetailsById(nodeId);

    if (!node) {
      res.status(404).json({
        error: "node_not_found",
        message: `No node found for id: ${nodeId}`,
      });
      return;
    }

    res.json(node);
  } catch (error) {
    console.error("Failed to fetch node details", error);
    res.status(500).json({
      error: "node_lookup_failed",
      message: "Could not retrieve node metadata.",
    });
  }
});

export default nodeRouter;
