import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { Board, Quote } from "@/lib/market/types";
import { CHAINS, UNIVERSE, UNIVERSE_BY_SYMBOL, type ChainId, type GroupId } from "@/lib/market/universe";
import { fmtPrice } from "@/lib/market/format";
import { Heat, Panel, Tone, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";

const FILTERS: { id: "all" | GroupId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "index", label: "Indices" },
  { id: "commodity", label: "Futures" },
  { id: "equity", label: "Equities" },
  { id: "rates", label: "Rates" },
];

export function Commodities({ board }: { board: Board }) {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const [chain, setChain] = useState<ChainId>("gold");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const by = useMemo(() => new Map(board.quotes.map((quote) => [quote.symbol, quote])), [board.quotes]);
  const active = CHAINS.find((item) => item.id === chain) ?? CHAINS[0];
  const members = UNIVERSE.filter((item) => item.chain === chain)
    .map((item) => by.get(item.symbol))
    .filter((quote): quote is Quote => !!quote);
  const selected = by.get(search.symbol);
  const rows = board.quotes.filter((quote) => {
    if (filter === "all") return true;
    return UNIVERSE_BY_SYMBOL.get(quote.symbol)?.group === filter;
  });

  return (
    <div className="grid gap-4">
      <Panel title={active.label} kicker={active.blurb}>
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {CHAINS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChain(item.id)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-3 text-sm",
                chain === item.id ? "border-fg bg-elevated text-fg" : "border-line text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {members.map((quote) => {
            const meta = UNIVERSE_BY_SYMBOL.get(quote.symbol);
            const rich = quote.divergence != null && quote.divergence >= 1.5;
            const cheap = quote.divergence != null && quote.divergence <= -1.5;
            return (
              <button
                key={quote.symbol}
                type="button"
                onClick={() => navigate({ search: (prev) => ({ ...prev, symbol: quote.symbol }) })}
                className="rounded-lg border border-line bg-bg p-3 text-left hover:bg-elevated"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{meta?.label}</span>
                  <Tone value={quote.d1} />
                </div>
                <p className="mt-1 font-mono text-lg tabular-nums">{fmtPrice(quote.price)}</p>
                <p className="mt-2 text-xs text-muted">
                  {meta?.role === "spot" || quote.divergence == null
                    ? "Benchmark"
                    : `Ratio z ${quote.divergence.toFixed(2)} vs spot`}
                  {rich ? " · rich vs spot" : ""}
                  {cheap ? " · cheap vs spot" : ""}
                </p>
              </button>
            );
          })}
        </div>
      </Panel>

      {selected ? (
        <Panel
          title={UNIVERSE_BY_SYMBOL.get(selected.symbol)?.label ?? selected.name}
          kicker={selected.symbol}
          action={
            <button
              type="button"
              className="h-11 text-sm text-muted"
              onClick={() => navigate({ search: (prev) => ({ ...prev, symbol: "" }) })}
            >
              Close
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
            <div>
              <p className="font-mono text-2xl tabular-nums">{fmtPrice(selected.price)}</p>
              <p className="mt-2 text-sm text-muted">1w <Tone value={selected.w1} /></p>
              <p className="text-sm text-muted">1m <Tone value={selected.m1} /></p>
              <p className="text-sm text-muted">1y <Tone value={selected.y1} /></p>
              {selected.divergence != null ? (
                <p className="mt-3 text-sm text-muted">
                  60-session z of the price ratio versus its chain spot: {selected.divergence.toFixed(2)}. Past 1.5 either way is a divergence flag.
                </p>
              ) : null}
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selected.spark}>
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip {...tooltipStyle} />
                  <Area dataKey="v" name="Close" stroke="var(--color-fg)" fill="var(--color-elevated)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Return heatmap"
        kicker="Green is up, red is down. Click a row."
        action={
          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "h-11 shrink-0 rounded-full border px-3 text-sm",
                  filter === item.id ? "border-fg text-fg" : "border-line text-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">1d</th>
                <th className="px-2 py-2 font-medium">1w</th>
                <th className="px-2 py-2 font-medium">1m</th>
                <th className="px-2 py-2 font-medium">1y</th>
                <th className="px-2 py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => {
                const flag = quote.divergence != null && Math.abs(quote.divergence) >= 1.5;
                return (
                  <tr
                    key={quote.symbol}
                    className="cursor-pointer border-t border-line hover:bg-elevated"
                    onClick={() => navigate({ search: (prev) => ({ ...prev, symbol: quote.symbol }) })}
                  >
                    <td className="py-2 pr-3">
                      <span className="block">{UNIVERSE_BY_SYMBOL.get(quote.symbol)?.label ?? quote.name}</span>
                      <span className="font-mono text-xs text-muted">{quote.symbol}</span>
                    </td>
                    <td className="px-2 py-2"><Heat value={quote.d1} /></td>
                    <td className="px-2 py-2"><Heat value={quote.w1} /></td>
                    <td className="px-2 py-2"><Heat value={quote.m1} /></td>
                    <td className="px-2 py-2"><Heat value={quote.y1} /></td>
                    <td className="px-2 py-2 text-xs text-warn">{flag ? "Diverging" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
