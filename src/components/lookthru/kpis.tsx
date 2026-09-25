import { formatMoney, formatPct } from "@/lib/lookthru/format";
import type { LookthroughResult } from "@/lib/lookthru/types";

export function Kpis({ result }: { result: LookthroughResult }) {
  const stockCount = result.leaves.filter((l) => l.kind === "equity").length;
  const top = result.leaves[0];
  const items = [
    { label: "Portfolio value", value: formatMoney(result.nav, result.currency) },
    { label: "Positions", value: String(result.positions.filter((p) => p.value > 0).length) },
    { label: "Underlying names", value: String(stockCount) },
    {
      label: "Top look-through",
      value: top ? `${top.displaySymbol} ${formatPct(top.weight)}` : "—",
    },
    {
      label: "Equity exposure",
      value: formatPct(result.equityExposure, 0),
      hint: result.equityExposure > 1.02 ? "Includes modest ETF leverage" : undefined,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line border border-line sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-4">
          <p className="text-[11px] tracking-wide text-muted uppercase">{item.label}</p>
          <p className="mt-1 font-mono text-lg tabular-nums text-fg">{item.value}</p>
          {item.hint ? <p className="mt-1 text-[11px] text-subtle">{item.hint}</p> : null}
        </div>
      ))}
    </section>
  );
}
