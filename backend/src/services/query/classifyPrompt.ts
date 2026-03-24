export type PromptClassification = {
  inScope: boolean;
  matchedDomainTerms: string[];
};

const DOMAIN_PHRASES = [
  "sap",
  "o2c",
  "order to cash",
  "sales order",
  "sales orders",
  "delivery",
  "deliveries",
  "billing document",
  "billing documents",
  "invoice",
  "invoices",
  "journal entry",
  "journal entries",
  "accounts receivable",
  "ar",
  "payment",
  "payments",
  "business partner",
  "customer",
  "customers",
  "product",
  "products",
  "material",
  "materials",
  "plant",
  "plants",
  "storage location",
  "company code",
  "company codes",
  "fiscal year",
  "fiscal years",
  "currency",
  "currencies",
  "billing type",
  "billing document type",
];

const DOMAIN_TOKENS = new Set([
  "sap",
  "o2c",
  "delivery",
  "deliveries",
  "billing",
  "invoice",
  "invoices",
  "journal",
  "payment",
  "payments",
  "receivable",
  "customer",
  "customers",
  "partner",
  "product",
  "products",
  "material",
  "materials",
  "plant",
  "plants",
  "storage",
  "location",
  "company",
  "code",
  "codes",
  "fiscal",
  "year",
  "years",
  "currency",
  "currencies",
  "trend",
  "trends",
  "flow",
  "flows",
  "broken",
  "incomplete",
]);

const EXPLORATION_TOKENS = new Set([
  "what",
  "which",
  "show",
  "list",
  "top",
  "count",
  "counts",
  "how",
  "many",
  "summary",
  "types",
  "type",
  "info",
  "present",
  "there",
  "trace",
  "find",
  "identify",
  "breakdown",
  "by",
]);

const OBVIOUSLY_OUT_OF_SCOPE_TERMS = [
  "weather",
  "temperature",
  "sports",
  "nba",
  "nfl",
  "soccer",
  "movie",
  "song",
  "lyrics",
  "recipe",
  "travel",
  "flight",
  "hotel",
  "joke",
  "poem",
  "politics",
  "bitcoin",
  "stock market",
  "programming tutorial",
  "leetcode",
];

const CLEARLY_OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(write|generate|compose)\b.*\b(poem|story|lyrics|song|joke)\b/i,
  /\bweather|temperature|forecast\b/i,
  /\bcapital of|president of|prime minister of\b/i,
  /\bmovie recommendation|travel itinerary|flight status\b/i,
  /\brecipe|cook|ingredients\b/i,
  /\btranslate\b/i,
];

function tokenize(question: string): string[] {
  return question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function classifyPrompt(question: string): PromptClassification {
  const normalized = question.toLowerCase().trim();
  const tokens = tokenize(normalized);

  const matchedDomainTerms = unique(
    DOMAIN_PHRASES.filter((term) => normalized.includes(term)).concat(
      tokens.filter((token) => DOMAIN_TOKENS.has(token)),
    ),
  );
  const matchedOutOfScopeTerms = OBVIOUSLY_OUT_OF_SCOPE_TERMS.filter((term) =>
    normalized.includes(term),
  );
  const matchesOutOfScopePattern = CLEARLY_OUT_OF_SCOPE_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );

  const domainTokenCount = tokens.filter((token) => DOMAIN_TOKENS.has(token)).length;
  const explorationTokenCount = tokens.filter((token) => EXPLORATION_TOKENS.has(token)).length;
  const hasBusinessIdSignal = /\b(3\d{8}|7\d{5}|9\d{7})\b/.test(normalized);

  const shortQuestionLikelyDomain = tokens.length <= 4 && domainTokenCount >= 1;
  const exploratoryBusinessPrompt = explorationTokenCount >= 1 && domainTokenCount >= 1;
  const domainDensePrompt = domainTokenCount >= 2;

  if (
    matchedDomainTerms.length > 0 ||
    shortQuestionLikelyDomain ||
    exploratoryBusinessPrompt ||
    domainDensePrompt ||
    hasBusinessIdSignal
  ) {
    return {
      inScope: true,
      matchedDomainTerms,
    };
  }

  if (matchedOutOfScopeTerms.length > 0 || matchesOutOfScopePattern) {
    return {
      inScope: false,
      matchedDomainTerms,
    };
  }

  // Default to permissive behavior: let Gemini attempt interpretation for vague prompts
  // unless they are clearly unrelated.
  const hasMeaningfulText = /[a-z0-9]/i.test(normalized);

  return {
    inScope: hasMeaningfulText,
    matchedDomainTerms,
  };
}
