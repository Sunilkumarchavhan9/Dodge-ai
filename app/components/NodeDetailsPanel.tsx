"use client";

import { AnimatePresence, motion } from "framer-motion";

import { ErrorBanner } from "./ui/ErrorBanner";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";

export type NodeDetails = {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
};

type NodeDetailsPanelProps = {
  open: boolean;
  nodeId: string | null;
  node: NodeDetails | null;
  loading: boolean;
  error: string | null;
  connectionCount: number;
  onClose: () => void;
};

type MetadataGroup = {
  title: string;
  entries: Array<[string, unknown]>;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getGroupKey(field: string): "Core" | "Financial" | "Dates" | "Status" | "Other" {
  const key = field.toLowerCase();

  if (key.includes("date") || key.includes("time")) {
    return "Dates";
  }

  if (
    key.includes("amount") ||
    key.includes("currency") ||
    key.includes("value") ||
    key.includes("net") ||
    key.includes("tax")
  ) {
    return "Financial";
  }

  if (key.includes("status") || key.includes("blocked") || key.includes("cancel")) {
    return "Status";
  }

  if (
    key.includes("id") ||
    key.includes("document") ||
    key.includes("order") ||
    key.includes("item") ||
    key.includes("type") ||
    key.includes("plant") ||
    key.includes("customer") ||
    key.includes("product") ||
    key.includes("company") ||
    key.includes("fiscal")
  ) {
    return "Core";
  }

  return "Other";
}

function buildMetadataGroups(metadata: Record<string, unknown>): MetadataGroup[] {
  const groups = new Map<MetadataGroup["title"], MetadataGroup["entries"]>([
    ["Core", []],
    ["Financial", []],
    ["Dates", []],
    ["Status", []],
    ["Other", []],
  ]);

  for (const entry of Object.entries(metadata)) {
    const groupKey = getGroupKey(entry[0]);
    groups.get(groupKey)?.push(entry);
  }

  return [...groups.entries()]
    .map(([title, entries]) => ({ title, entries }))
    .filter((group) => group.entries.length > 0);
}

export function NodeDetailsPanel({
  open,
  nodeId,
  node,
  loading,
  error,
  connectionCount,
  onClose,
}: NodeDetailsPanelProps) {
  const visibleEntries = node ? Object.entries(node.metadata).slice(0, 18) : [];
  const hiddenEntryCount = node ? Math.max(0, Object.keys(node.metadata).length - visibleEntries.length) : 0;
  const metadataGroups = node
    ? buildMetadataGroups(
        Object.fromEntries(visibleEntries.map(([key, value]) => [key, value])) as Record<string, unknown>,
      )
    : [];

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.99 }}
          transition={{ duration: 0.16 }}
          className="absolute left-1/2 top-6 z-30 w-[390px] max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-none border border-zinc-200 bg-white/95 p-3 shadow-[0_20px_44px_rgba(15,23,42,0.16)] backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold leading-5 text-zinc-900">{node?.label ?? nodeId ?? "Node"}</p>
              <p className="mt-1 text-sm text-zinc-700">
                Entity: <span className="font-medium">{node?.type ?? "Unknown"}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-none border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
            >
              Close
            </button>
          </div>

          <div className="mt-3 max-h-[380px] overflow-auto pr-1">
            {loading ? <LoadingSkeleton lines={8} /> : null}
            {!loading && error ? <ErrorBanner title="Node lookup failed" message={error} tone="warning" /> : null}

            {!loading && !error && node ? (
              <div className="space-y-3 text-sm">
                {metadataGroups.map((group) => (
                  <section key={group.title} className="rounded-none border border-zinc-200 bg-zinc-50/75 p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{group.title}</p>
                    <dl className="mt-1.5 space-y-1.5">
                      {group.entries.map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[140px_1fr] gap-2">
                          <dt className="truncate text-zinc-600">{key}:</dt>
                          <dd className="break-words text-zinc-800">{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            ) : null}
          </div>

          {hiddenEntryCount > 0 ? (
            <p className="mt-2 text-xs italic text-zinc-500">Additional fields hidden for readability</p>
          ) : null}
          <div className="mt-2 flex items-center justify-between rounded-none border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">Connections</p>
            <p className="text-sm font-semibold text-zinc-800">{connectionCount}</p>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

