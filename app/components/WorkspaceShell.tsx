import { GraphContainer } from "./GraphContainer";
import { QueryBox } from "./QueryBox";

export function WorkspaceShell() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f4f4f5_62%,#f4f4f5_100%)] px-2 py-2 md:px-4 md:py-4 lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-[1760px] flex-col lg:h-full lg:min-h-0">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-none border border-zinc-200/90 bg-white/90 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-none border border-zinc-300 bg-white text-[10px]">
              ▣
            </span>
            <span className="text-zinc-400">|</span>
            <span className="font-medium text-zinc-400">Mapping</span>
            <span className="text-zinc-400">/</span>
            <span className="font-semibold text-zinc-800">Order to Cash</span>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="rounded-none border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
              Graph Workspace
            </span>
            <span className="rounded-none border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
              LLM Query
            </span>
          </div>
        </header>

        <section className="flex-1 overflow-hidden rounded-none border border-zinc-200/95 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-white/65 lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_390px]">
          <GraphContainer />
          <QueryBox />
        </section>
      </div>
    </main>
  );
}

