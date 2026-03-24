"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import { readJsonResponse } from "../lib/http";
import { ErrorBanner } from "./ui/ErrorBanner";

type QueryAcceptedResponse = {
  accepted: true;
  sql: string;
  rows: Record<string, unknown>[];
  answer: string;
  highlights: string[];
};

type QueryRejectedResponse = {
  accepted: false;
  reason: "out_of_scope" | "unsafe_query" | "no_data";
};

type QueryResponse = QueryAcceptedResponse | QueryRejectedResponse;

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  detail?: {
    sql?: string;
    rows?: number;
    highlights?: string[];
    previewRows?: Record<string, unknown>[];
  };
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

const AGENT_NAME = "Dodge AI";
const AGENT_ROLE = "Graph Agent";
const GRAPH_NODE_ID_PATTERN =
  /^(business_partner|sales_order|sales_order_item|outbound_delivery|outbound_delivery_item|billing_document|billing_document_item|journal_entry_item|payment|product|plant):.+$/;
const MIN_THINKING_MS = 900;

const REJECTION_REASON_LABEL: Record<QueryRejectedResponse["reason"], string> = {
  out_of_scope: "This system is designed for SAP O2C dataset questions only.",
  unsafe_query: "Could not safely map that request to a validated SELECT query.",
  no_data: "The query executed safely but returned no matching rows.",
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "assistant-initial",
    role: "assistant",
    text: "Hi! I can help you analyze the Order to Cash process.",
  },
];

export function QueryBox() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const chatScrollerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!chatScrollerRef.current || !chatEndRef.current) {
      return;
    }

    chatEndRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, loading]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setLoading(true);
    setError(null);
    const startedAt = Date.now();

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: trimmed }),
      });

      const payload = await readJsonResponse<QueryResponse | ApiErrorPayload>(response);
      if (!("accepted" in payload)) {
        throw new Error(payload.message ?? `Request failed with status ${response.status}`);
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_THINKING_MS) {
        await new Promise((resolve) => {
          setTimeout(resolve, MIN_THINKING_MS - elapsed);
        });
      }

      if (payload.accepted) {
        const nodeHighlights = payload.highlights.filter((highlight) => GRAPH_NODE_ID_PATTERN.test(highlight));

        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: payload.answer,
            detail: {
              sql: payload.sql,
              rows: payload.rows.length,
              highlights: nodeHighlights.slice(0, 10),
              previewRows: payload.rows.slice(0, 3),
            },
          },
        ]);
      } else {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: REJECTION_REASON_LABEL[payload.reason],
          },
        ]);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const statusLabel = loading ? `${AGENT_NAME} is thinking` : `${AGENT_NAME} is awaiting instructions`;
  const statusTextClass = loading ? "status-text-live" : "status-text-idle";
  const statusDotClass = loading ? "status-dot-live" : "status-dot-idle";

  return (
    <aside className="flex min-h-[560px] flex-col border-t border-zinc-200 bg-zinc-50/55 lg:h-full lg:min-h-0 lg:border-l lg:border-t-0">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-4">
        <p className="text-[26px] font-semibold leading-7 text-zinc-900">Chat with Graph</p>
        <p className="mt-1 text-sm text-zinc-500">Order to Cash</p>
        <div className="mt-3 flex items-center gap-2 rounded-none border border-zinc-200 bg-zinc-50 px-2.5 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
            D
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">{AGENT_NAME}</p>
            <p className="text-xs text-zinc-500">{AGENT_ROLE}</p>
          </div>
        </div>
      </header>

      <section ref={chatScrollerRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
        {error ? <ErrorBanner title="Request error" message={error} /> : null}

        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const isAssistant = message.role === "assistant";
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14 }}
                className="space-y-2.5"
              >
                <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[92%] ${isAssistant ? "" : "text-right"}`}>
                    {isAssistant ? (
                      <div className="flex items-start gap-2">
                        <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                          D
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">{AGENT_NAME}</p>
                          <div className="mt-1 rounded-none border border-zinc-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-zinc-800 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                            {message.text}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-zinc-500">You</p>
                        <div className="mt-1 rounded-none border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-sm leading-6 text-zinc-100 shadow-[0_12px_26px_rgba(15,23,42,0.25)]">
                          {message.text}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isAssistant && message.detail ? (
                  <details className="ml-9 rounded-none border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-600 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <summary className="cursor-pointer select-none font-medium text-zinc-700 marker:text-zinc-500">
                      Debug details
                    </summary>
                    <div className="mt-2 space-y-2">
                      <p className="text-zinc-600">Rows returned: {message.detail.rows ?? 0}</p>
                      {message.detail.highlights && message.detail.highlights.length > 0 ? (
                        <div>
                          <p className="mb-1 font-medium text-zinc-700">Graph highlights</p>
                          <div className="max-h-20 overflow-y-auto rounded-none border border-zinc-200 bg-zinc-50 p-2">
                            {message.detail.highlights.map((highlight) => (
                              <p key={highlight} className="truncate text-[11px] leading-5 text-zinc-600">
                                {highlight}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {message.detail.previewRows && message.detail.previewRows.length > 0 ? (
                        <div>
                          <p className="mb-1 font-medium text-zinc-700">Result preview</p>
                          <pre className="max-h-24 overflow-auto rounded-none border border-zinc-200 bg-zinc-50 p-2 text-[11px]">
                            {JSON.stringify(message.detail.previewRows, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {message.detail.sql ? (
                        <div>
                          <p className="mb-1 font-medium text-zinc-700">Validated SQL</p>
                          <pre className="max-h-32 overflow-auto rounded-none border border-zinc-200 bg-zinc-50 p-2 text-[11px]">
                            {message.detail.sql}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-start gap-2 rounded-none border border-zinc-200 bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              D
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">{AGENT_NAME}</p>
              <p className="mt-1 text-sm font-medium shimmer-text">
                Thinking through schema context and generating a safe SELECT query
              </p>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 thinking-dot [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 thinking-dot [animation-delay:180ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 thinking-dot [animation-delay:360ms]" />
              </div>
            </div>
          </div>
        ) : null}
        <div ref={chatEndRef} />
      </section>

      <footer className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
          <span className={`inline-flex items-center gap-1 ${statusTextClass}`}>
            <span>{statusLabel}</span>
            {loading ? (
              <span className="inline-flex items-center gap-0.5">
                <span className="h-1 w-1 rounded-full bg-current thinking-dot [animation-delay:0ms]" />
                <span className="h-1 w-1 rounded-full bg-current thinking-dot [animation-delay:180ms]" />
                <span className="h-1 w-1 rounded-full bg-current thinking-dot [animation-delay:360ms]" />
              </span>
            ) : null}
          </span>
        </div>
        <form ref={formRef} className="space-y-2" onSubmit={onSubmit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="Analyze anything"
            className="min-h-[96px] w-full resize-none rounded-none border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none ring-zinc-300 placeholder:text-zinc-500 focus:bg-white focus:ring-2"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-zinc-500">Press Enter to send</p>
            <button
              type="submit"
              disabled={loading}
              className="rounded-none bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_22px_rgba(15,23,42,0.25)] transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </footer>
    </aside>
  );
}

