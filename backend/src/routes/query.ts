import { Router } from "express";

import type { QueryResponse } from "../types/query";
import { answerFromRows } from "../services/query/answerFromRows";
import { classifyPrompt } from "../services/query/classifyPrompt";
import { executeSql } from "../services/query/executeSql";
import { generateSql } from "../services/query/generateSql";
import { validateSql } from "../services/query/validateSql";

const queryRouter = Router();

queryRouter.post("/api/query", async (req, res) => {
  try {
    const questionRaw = req.body?.question;
    const question = typeof questionRaw === "string" ? questionRaw.trim() : "";

    if (!question) {
      const response: QueryResponse = {
        accepted: false,
        reason: "out_of_scope",
      };
      res.status(400).json(response);
      return;
    }

    const classification = classifyPrompt(question);
    if (!classification.inScope) {
      const response: QueryResponse = {
        accepted: false,
        reason: "out_of_scope",
      };
      res.json(response);
      return;
    }

    const generated = await generateSql(question);
    if (generated.outOfScope) {
      const response: QueryResponse = {
        accepted: false,
        reason: "out_of_scope",
      };
      res.json(response);
      return;
    }

    if (!generated.sql) {
      const response: QueryResponse = {
        accepted: false,
        reason: "unsafe_query",
      };
      res.json(response);
      return;
    }

    const validation = validateSql(generated.sql);
    if (!validation.isValid || !validation.safeSql) {
      const response: QueryResponse = {
        accepted: false,
        reason: "unsafe_query",
      };
      res.json(response);
      return;
    }

    const rows = await executeSql(validation.safeSql);
    if (rows.length === 0) {
      const response: QueryResponse = {
        accepted: false,
        reason: "no_data",
      };
      res.json(response);
      return;
    }

    const answer = answerFromRows(question, validation.safeSql, rows);

    const response: QueryResponse = {
      accepted: true,
      sql: validation.safeSql,
      rows,
      answer: answer.answer,
      highlights: answer.highlights,
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to process query", error);
    res.status(500).json({
      accepted: false,
      reason: "unsafe_query",
    } satisfies QueryResponse);
  }
});

export default queryRouter;
