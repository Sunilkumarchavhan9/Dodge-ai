"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readJsonResponse } from "../lib/http";
import { NodeDetailsPanel, type NodeDetails } from "./NodeDetailsPanel";
import { ErrorBanner } from "./ui/ErrorBanner";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";

type GraphNode = {
  id: string;
  type: string;
  label: string;
};

type GraphEdge = {
  id: string;
  type: string;
  source: string;
  target: string;
};

type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

type PositionedNode = GraphNode & {
  x: number;
  y: number;
};

type DragPosition = {
  x: number;
  y: number;
};

type TypeLayoutConfig = {
  x: number;
  y: number;
  spread: number;
  tone: "blue" | "red" | "amber";
};

const TYPE_LAYOUT: Record<string, TypeLayoutConfig> = {
  business_partner: { x: 9, y: 18, spread: 1.55, tone: "red" },
  sales_order: { x: 21, y: 18, spread: 1.35, tone: "blue" },
  sales_order_item: { x: 34, y: 18, spread: 1.35, tone: "blue" },
  outbound_delivery: { x: 47, y: 18, spread: 1.25, tone: "blue" },
  outbound_delivery_item: { x: 60, y: 18, spread: 1.25, tone: "blue" },
  billing_document: { x: 73, y: 18, spread: 1.25, tone: "blue" },
  billing_document_item: { x: 86, y: 18, spread: 1.25, tone: "blue" },
  journal_entry_item: { x: 73, y: 67, spread: 1.25, tone: "amber" },
  payment: { x: 86, y: 67, spread: 1.25, tone: "amber" },
  product: { x: 34, y: 67, spread: 1.65, tone: "red" },
  plant: { x: 47, y: 67, spread: 1.45, tone: "red" },
};

const RENDER_NODE_LIMIT = 1200;
const EDGE_LIMIT_GRANULAR = 1800;
const EDGE_LIMIT_BACKBONE = 750;
const PER_NODE_EDGE_CAP_GRANULAR = 8;
const PER_NODE_EDGE_CAP_BACKBONE = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashNumber(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildClusterLayout(nodes: GraphNode[], seed: number): PositionedNode[] {
  const grouped = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const existing = grouped.get(node.type) ?? [];
    existing.push(node);
    grouped.set(node.type, existing);
  }

  const positioned: PositionedNode[] = [];
  const maxPerRing = 26;

  for (const [type, typeNodes] of grouped.entries()) {
    const config = TYPE_LAYOUT[type] ?? { x: 50, y: 50, spread: 1.1, tone: "blue" as const };
    const sortedNodes = [...typeNodes].sort((a, b) => a.id.localeCompare(b.id));

    for (let index = 0; index < sortedNodes.length; index += 1) {
      const node = sortedNodes[index];
      const ring = Math.floor(index / maxPerRing) + 1;
      const slot = index % maxPerRing;
      const angle = (slot / maxPerRing) * Math.PI * 2 + seed * 0.22;
      const radiusX = ring * 1.9 * config.spread;
      const radiusY = ring * 1.45 * config.spread;

      const jitterSeed = hashNumber(node.id);
      const jitterX = ((jitterSeed % 7) - 3) * 0.11;
      const jitterY = ((Math.floor(jitterSeed / 7) % 7) - 3) * 0.11;

      positioned.push({
        ...node,
        x: clamp(config.x + Math.cos(angle) * radiusX + jitterX, 2, 98),
        y: clamp(config.y + Math.sin(angle) * radiusY + jitterY, 2, 98),
      });
    }
  }

  return positioned;
}

function collectRenderableEdges(
  edges: GraphEdge[],
  visibleNodeIds: Set<string>,
  selectedNodeId: string | null,
  showGranularOverlay: boolean,
): GraphEdge[] {
  const perNodeCap = showGranularOverlay ? PER_NODE_EDGE_CAP_GRANULAR : PER_NODE_EDGE_CAP_BACKBONE;
  const edgeLimit = showGranularOverlay ? EDGE_LIMIT_GRANULAR : EDGE_LIMIT_BACKBONE;
  const counts = new Map<string, number>();
  const selectedEdgeIds = new Set<string>();
  const prioritized: GraphEdge[] = [];
  const regular: GraphEdge[] = [];

  for (const edge of edges) {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      continue;
    }

    const isSelectedEdge = Boolean(
      selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId),
    );

    if (isSelectedEdge) {
      if (!selectedEdgeIds.has(edge.id)) {
        selectedEdgeIds.add(edge.id);
        prioritized.push(edge);
      }
      continue;
    }

    const sourceCount = counts.get(edge.source) ?? 0;
    const targetCount = counts.get(edge.target) ?? 0;
    if (sourceCount >= perNodeCap || targetCount >= perNodeCap) {
      continue;
    }

    counts.set(edge.source, sourceCount + 1);
    counts.set(edge.target, targetCount + 1);
    regular.push(edge);

    if (prioritized.length + regular.length >= edgeLimit) {
      break;
    }
  }

  return [...prioritized, ...regular].slice(0, edgeLimit);
}

function toneClasses(tone: "blue" | "red" | "amber"): string {
  if (tone === "red") {
    return "border-rose-400/70 bg-rose-200/55";
  }

  if (tone === "amber") {
    return "border-amber-500/70 bg-amber-200/60";
  }

  return "border-blue-500/70 bg-blue-300/55";
}

export function GraphContainer() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const activeDragNodeIdRef = useRef<string | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layoutSeed, setLayoutSeed] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [showGranularOverlay, setShowGranularOverlay] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<NodeDetails | null>(null);
  const [nodeLookupLoading, setNodeLookupLoading] = useState(false);
  const [nodeLookupError, setNodeLookupError] = useState<string | null>(null);
  const [manualPositions, setManualPositions] = useState<Record<string, DragPosition>>({});

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/graph", { cache: "no-store" });
      const payload = await readJsonResponse<GraphResponse | ApiErrorPayload>(response);

      if (!response.ok) {
        const errorMessage =
          (payload as ApiErrorPayload).message ?? `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      const graphPayload = payload as GraphResponse;
      setGraph(graphPayload);
      setManualPositions({});
      setSelectedNodeId((currentSelectedNodeId) =>
        graphPayload.nodes.some((node) => node.id === currentSelectedNodeId) ? currentSelectedNodeId : null,
      );
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    let active = true;

    const loadNodeDetails = async () => {
      if (!selectedNodeId) {
        setSelectedNodeDetails(null);
        setNodeLookupError(null);
        return;
      }

      setNodeLookupLoading(true);
      setNodeLookupError(null);

      try {
        const response = await fetch(`/api/node/${encodeURIComponent(selectedNodeId)}`, {
          cache: "no-store",
        });
        const payload = await readJsonResponse<NodeDetails | ApiErrorPayload>(response);

        if (!response.ok) {
          const errorMessage =
            (payload as ApiErrorPayload).message ?? `Node request failed with status ${response.status}`;
          throw new Error(errorMessage);
        }

        if (active) {
          setSelectedNodeDetails(payload as NodeDetails);
        }
      } catch (lookupError) {
        if (active) {
          setNodeLookupError((lookupError as Error).message);
          setSelectedNodeDetails(null);
        }
      } finally {
        if (active) {
          setNodeLookupLoading(false);
        }
      }
    };

    void loadNodeDetails();

    return () => {
      active = false;
    };
  }, [selectedNodeId]);

  const baseLayoutNodes = useMemo(
    () => buildClusterLayout((graph?.nodes ?? []).slice(0, RENDER_NODE_LIMIT), layoutSeed),
    [graph, layoutSeed],
  );

  const displayNodes = useMemo(
    () =>
      baseLayoutNodes.map((node) => {
        const manual = manualPositions[node.id];
        if (!manual) {
          return node;
        }

        return {
          ...node,
          x: manual.x,
          y: manual.y,
        };
      }),
    [baseLayoutNodes, manualPositions],
  );

  const positionById = useMemo(() => {
    const byId = new Map<string, PositionedNode>();
    for (const node of displayNodes) {
      byId.set(node.id, node);
    }
    return byId;
  }, [displayNodes]);

  const renderableEdges = useMemo(
    () =>
      collectRenderableEdges(
        graph?.edges ?? [],
        new Set(displayNodes.map((node) => node.id)),
        selectedNodeId,
        showGranularOverlay,
      ),
    [graph, displayNodes, selectedNodeId, showGranularOverlay],
  );

  const selectedNodeConnections = useMemo(() => {
    if (!selectedNodeId || !graph) {
      return 0;
    }

    return graph.edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId).length;
  }, [graph, selectedNodeId]);

  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) {
      return new Set<string>();
    }

    const connected = new Set<string>([selectedNodeId]);
    for (const edge of renderableEdges) {
      if (edge.source === selectedNodeId) {
        connected.add(edge.target);
      }
      if (edge.target === selectedNodeId) {
        connected.add(edge.source);
      }
    }
    return connected;
  }, [renderableEdges, selectedNodeId]);

  const nodeTypeStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of graph?.nodes ?? []) {
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
  }, [graph]);

  const hasGraphData = (graph?.nodes.length ?? 0) > 0;
  const canvasHeightClass = minimized ? "h-[360px]" : "min-h-[480px] lg:h-full";

  const applyDragFromPointer = useCallback((clientX: number, clientY: number) => {
    const dragNodeId = activeDragNodeIdRef.current;
    if (!dragNodeId || !canvasRef.current) {
      return;
    }

    const bounds = canvasRef.current.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }

    const x = clamp(((clientX - bounds.left) / bounds.width) * 100, 1.5, 98.5);
    const y = clamp(((clientY - bounds.top) / bounds.height) * 100, 1.5, 98.5);

    setManualPositions((current) => ({
      ...current,
      [dragNodeId]: { x, y },
    }));
  }, []);

  const finishDrag = useCallback(() => {
    activeDragNodeIdRef.current = null;
  }, []);

  return (
    <section className="relative min-h-0 border-b border-zinc-200 bg-zinc-100/40 lg:border-b-0 lg:border-r lg:border-r-zinc-200">
      <div
        ref={canvasRef}
        className={`relative overflow-hidden ${canvasHeightClass}`}
        onPointerLeave={finishDrag}
        onPointerUp={finishDrag}
      >
        <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(248,250,252,0.95)_0%,rgba(244,244,245,0.92)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:28px_28px]" />

        <div className="absolute left-4 top-3 z-20 flex items-center gap-2 rounded-none border border-zinc-200/90 bg-white/90 p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMinimized((current) => !current)}
            className="rounded-none border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            {minimized ? "Expand" : "Minimize"}
          </button>
          <button
            type="button"
            onClick={() => setShowGranularOverlay((current) => !current)}
            className={`rounded-none border px-3 py-1.5 text-xs font-medium transition ${
              showGranularOverlay
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {showGranularOverlay ? "Granular On" : "Granular Off"}
          </button>
          <button
            type="button"
            onClick={() => setLayoutSeed((current) => current + 1)}
            className="rounded-none border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            Re-layout
          </button>
        </div>

        <div className="absolute right-4 top-3 z-20 rounded-none border border-zinc-200/90 bg-white/92 px-3 py-2 text-[11px] text-zinc-600 shadow-[0_12px_24px_rgba(15,23,42,0.06)]">
          <p className="font-semibold text-zinc-700">Nodes {graph?.nodes.length ?? 0}</p>
          <p className="mt-0.5">Edges {graph?.edges.length ?? 0}</p>
          {selectedNodeId ? <p className="mt-0.5 text-zinc-700">Connected {selectedNodeConnections}</p> : null}
        </div>

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center px-12">
            <div className="w-full max-w-xl rounded-none border border-zinc-200 bg-white/95 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-zinc-700">Loading graph workspace...</p>
              <LoadingSkeleton className="mt-3" lines={6} />
            </div>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="absolute inset-0 flex items-center justify-center px-12">
            <div className="w-full max-w-xl">
              <ErrorBanner
                title="Graph failed to load"
                message={error}
                actionLabel="Try again"
                onAction={() => {
                  void loadGraph();
                }}
              />
            </div>
          </div>
        ) : null}

        {!loading && !error && !hasGraphData ? (
          <div className="absolute inset-0 flex items-center justify-center px-12">
            <div className="w-full max-w-xl rounded-none border border-zinc-200 bg-white/96 p-6 text-center shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-zinc-800">No graph data available</p>
              <p className="mt-2 text-sm text-zinc-600">
                Database appears empty or unavailable. Run `npm run db:setup` and reload.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !error && hasGraphData ? (
          <>
            <svg className="absolute inset-0 h-full w-full">
              {renderableEdges.map((edge) => {
                const source = positionById.get(edge.source);
                const target = positionById.get(edge.target);
                if (!source || !target) {
                  return null;
                }

                const isSelectedEdge = Boolean(
                  selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId),
                );
                const strokeColor = isSelectedEdge
                  ? "rgba(100, 116, 139, 0.56)"
                  : selectedNodeId
                    ? "rgba(148, 163, 184, 0.14)"
                    : "rgba(59, 130, 246, 0.18)";

                return (
                  <g key={edge.id}>
                    <line
                      x1={`${source.x}%`}
                      y1={`${source.y}%`}
                      x2={`${target.x}%`}
                      y2={`${target.y}%`}
                      stroke={strokeColor}
                      strokeWidth={isSelectedEdge ? 1.7 : 0.85}
                    />
                    {isSelectedEdge ? (
                      <line
                        className="beam-edge"
                        x1={`${source.x}%`}
                        y1={`${source.y}%`}
                        x2={`${target.x}%`}
                        y2={`${target.y}%`}
                        stroke="rgba(203, 213, 225, 0.95)"
                        strokeWidth={1.35}
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>

            <div className="absolute inset-0">
              {displayNodes.map((node) => {
                const typeStyle = TYPE_LAYOUT[node.type] ?? {
                  x: 50,
                  y: 50,
                  spread: 1.1,
                  tone: "blue" as const,
                };
                const isSelected = selectedNodeId === node.id;
                const isConnected = connectedNodeIds.has(node.id);

                return (
                  <motion.button
                    key={node.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.72 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => setSelectedNodeId(node.id)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      activeDragNodeIdRef.current = node.id;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setSelectedNodeId(node.id);
                      applyDragFromPointer(event.clientX, event.clientY);
                    }}
                    onPointerMove={(event) => {
                      if (
                        activeDragNodeIdRef.current === node.id &&
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      ) {
                        applyDragFromPointer(event.clientX, event.clientY);
                      }
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      finishDrag();
                    }}
                    onPointerCancel={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      finishDrag();
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition ${toneClasses(
                      typeStyle.tone,
                    )} ${
                      isSelected
                        ? "h-4 w-4 ring-2 ring-zinc-800/25 shadow-[0_0_0_3px_rgba(255,255,255,0.6)]"
                        : isConnected
                          ? "h-3.5 w-3.5 opacity-95"
                          : "h-2.5 w-2.5 opacity-70"
                    } cursor-grab active:cursor-grabbing`}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    title={node.label}
                  />
                );
              })}
            </div>

            <div className="absolute bottom-4 left-4 z-20 max-w-[280px] rounded-none border border-zinc-200/90 bg-white/92 p-3 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Entity Mix</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nodeTypeStats.map(([type, count]) => (
                  <span
                    key={type}
                    className="rounded-none border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-600"
                  >
                    {type.replace(/_/g, " ")} · {count}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <NodeDetailsPanel
          open={selectedNodeId !== null}
          nodeId={selectedNodeId}
          node={selectedNodeDetails}
          loading={nodeLookupLoading}
          error={nodeLookupError}
          connectionCount={selectedNodeConnections}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
    </section>
  );
}

