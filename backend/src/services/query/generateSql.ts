import { generateDeterministicSql } from "./deterministicSql";
import { generateSqlWithGemini } from "./providers/llmProvider";
import { LLM_SQL_PROMPT } from "./schemaContext";

export type GeneratedSql = {
  sql: string | null;
  outOfScope: boolean;
  source: "llm" | "deterministic";
  generationContext: string;
  rawModelOutput?: string | null;
};

function normalizeSqlOutput(text: string): string {
  return text
    .trim()
    .replace(/^sql\s*[:\-]\s*/i, "")
    .replace(/;$/, "")
    .trim();
}

function isOutOfScopeOutput(text: string): boolean {
  return /^OUT_OF_SCOPE\b/i.test(text.trim());
}

function hasStrongDomainSignal(question: string): boolean {
  const normalized = question.toLowerCase();
  return /(sales|billing|invoice|delivery|journal|payment|customer|product|material|plant|currency|fiscal|company|o2c|order to cash)/.test(
    normalized,
  );
}

export async function generateSql(question: string): Promise<GeneratedSql> {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() ?? "gemini";

  if (provider === "gemini") {
    const llmResult = await generateSqlWithGemini({
      question,
      prompt: LLM_SQL_PROMPT,
    });

    if (llmResult.text) {
      const normalized = normalizeSqlOutput(llmResult.text);

      if (isOutOfScopeOutput(normalized)) {
        if (hasStrongDomainSignal(question)) {
          const fallback = generateDeterministicSql(question);
          return {
            sql: fallback.sql,
            outOfScope: fallback.outOfScope,
            source: "deterministic",
            generationContext: fallback.generationContext,
            rawModelOutput: llmResult.text,
          };
        }

        return {
          sql: null,
          outOfScope: true,
          source: "llm",
          generationContext: LLM_SQL_PROMPT,
          rawModelOutput: llmResult.text,
        };
      }

      return {
        sql: normalized,
        outOfScope: false,
        source: "llm",
        generationContext: LLM_SQL_PROMPT,
        rawModelOutput: llmResult.text,
      };
    }
  }

  const fallback = generateDeterministicSql(question);
  return {
    sql: fallback.sql,
    outOfScope: fallback.outOfScope,
    source: "deterministic",
    generationContext: fallback.generationContext,
    rawModelOutput: null,
  };
}
