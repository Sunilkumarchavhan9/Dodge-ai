export type LlmSqlOutput = {
  text: string | null;
  provider: "gemini";
};

function extractTextFromGeminiResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;
  const candidates = asRecord.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const firstCandidate = candidates[0] as Record<string, unknown>;
  const content = firstCandidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts;

  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }

  const firstPart = parts[0] as Record<string, unknown>;
  const text = firstPart.text;

  return typeof text === "string" ? text.trim() : null;
}

function normalizeModelOutput(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

export async function generateSqlWithGemini(params: {
  question: string;
  prompt: string;
}): Promise<LlmSqlOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      text: null,
      provider: "gemini",
    };
  }

  const timeoutMs = Number.parseInt(process.env.LLM_SQL_TIMEOUT_MS ?? "20000", 10);
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = [
    configuredModel,
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number.isNaN(timeoutMs) ? 20000 : timeoutMs);

  try {
    for (const model of modelCandidates) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${params.prompt}\n\nUser question: ${params.question}` }],
              },
            ],
            generationConfig: {
              temperature: 0,
              topP: 0.95,
              maxOutputTokens: 512,
            },
          }),
          signal: controller.signal,
        },
      );

      if (response.ok) {
        const payload = (await response.json()) as unknown;
        const extracted = extractTextFromGeminiResponse(payload);

        return {
          text: normalizeModelOutput(extracted),
          provider: "gemini",
        };
      }

      if (response.status !== 404) {
        console.error("Gemini SQL generation failed", {
          model,
          status: response.status,
          statusText: response.statusText,
        });
        return {
          text: null,
          provider: "gemini",
        };
      }
    }

    console.error("Gemini SQL generation failed: no configured model is available", {
      modelsTried: modelCandidates,
    });
    return {
      text: null,
      provider: "gemini",
    };
  } catch (error) {
    console.error("Gemini request error", error);
    return {
      text: null,
      provider: "gemini",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
