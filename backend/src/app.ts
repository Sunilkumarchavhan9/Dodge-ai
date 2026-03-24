import "dotenv/config";

import cors from "cors";
import express from "express";

import graphRouter from "./routes/graph";
import nodeRouter from "./routes/node";
import queryRouter from "./routes/query";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: false,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(graphRouter);
  app.use(nodeRouter);
  app.use(queryRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: "not_found",
      message: "Route not found.",
    });
  });

  return app;
}
