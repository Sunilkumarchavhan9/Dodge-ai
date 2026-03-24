const FLOW_STEPS = [
  "Business Partner",
  "Sales Order",
  "Outbound Delivery",
  "Billing Document",
  "AR Journal",
  "Payment",
] as const;

export function FlowLegendCard() {
  return (
    <section className="rounded-none border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Canonical flow</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-900">O2C stage mapping</h3>
        </div>
        <p className="text-xs text-zinc-500">Used by graph relationships and NL query prompts.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FLOW_STEPS.map((step, index) => (
          <div key={step} className="flex items-center gap-2">
            <span className="rounded-none border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
              {step}
            </span>
            {index < FLOW_STEPS.length - 1 ? <span className="text-xs text-zinc-400">→</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

