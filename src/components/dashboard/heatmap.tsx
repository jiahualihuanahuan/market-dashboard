import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHeatmap } from "@/lib/market/board.functions";
import { fmtPct } from "@/lib/market/format";
import { Panel } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const INDEXES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^NDX", label: "Nasdaq-100" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^GDAXI", label: "DAX" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "^AXJO", label: "ASX 200" },
  { symbol: "^GSPTSE", label: "S&P/TSX" },
];

const WINDOWS = [
  { id: "d1", label: "1 day", scale: 3 },
  { id: "w1", label: "1 week", scale: 6 },
  { id: "m1", label: "1 month", scale: 12 },
  { id: "y1", label: "1 year", scale: 40 },
] as const;

type WindowId = (typeof WINDOWS)[number]["id"];

export function HeatmapTab() {
  const [index, setIndex] = useState("^GSPC");
  const [horizon, setHorizon] = useState<WindowId>("d1");
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["heatmap", index],
    queryFn: () => getHeatmap({ data: { index, live: liveRef.current } }),
    staleTime: 8 * 60 * 1000,
  });

  useEffect(() => {
    const onRefresh = () => {
      liveRef.current = true;
      void query.refetch().finally(() => {
        liveRef.current = false;
      });
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  const scale = WINDOWS.find((item) => item.id === horizon)?.scale ?? 3;
  const cells = useMemo(() => {
    const rows = query.data?.cells ?? [];
    return [...rows].sort((a, b) => (b[horizon] ?? -999) - (a[horizon] ?? -999));
  }, [query.data, horizon]);

  return (
    <div className="grid gap-4">
      <Panel
        title={query.data?.label ?? "Index members"}
        kicker="Every stock in the index. Green is up, red is down."
        action={
          <div className="flex gap-2 overflow-x-auto">
            {WINDOWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setHorizon(item.id)}
                className={cn(
                  "h-11 shrink-0 rounded-full border px-3 text-sm",
                  horizon === item.id ? "border-fg text-fg" : "border-line text-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {INDEXES.map((item) => (
            <button
              key={item.symbol}
              type="button"
              onClick={() => setIndex(item.symbol)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-3 text-sm",
                index === item.symbol ? "border-fg bg-elevated text-fg" : "border-line text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm text-muted">
          One tile per stock. Darker means a bigger move. 1 day is the latest session versus the prior close. 1 week, 1 month, and 1 year count trading days, not calendar days.
          {query.data ? ` ${query.data.cells.length} of ${query.data.listed} names came back with a price.` : ""}
        </p>
        {query.isPending ? <p className="text-sm text-muted">Reading every member of the index.</p> : null}
        {query.isError ? (
          <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "The index list did not load."}</p>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.6rem,1fr))] gap-1">
          {cells.map((cell) => {
            const value = cell[horizon];
            return (
              <div
                key={cell.symbol}
                title={`${cell.symbol} ${value == null ? "no print" : fmtPct(value)}`}
                className="rounded-md px-1 py-2 text-center"
                style={tileStyle(value, scale)}
              >
                <span className="block truncate font-mono text-[11px]">{cell.symbol}</span>
                <span className="block font-mono text-[11px] tabular-nums">{value == null ? "—" : fmtPct(value)}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function tileStyle(value: number | null, scale: number): { background: string; color: string } {
  if (value == null || Math.abs(value) < 0.05) {
    return { background: "var(--color-elevated)", color: "var(--color-muted)" };
  }
  const mix = Math.round(Math.min(Math.abs(value) / scale, 1) * 72);
  const ink = value > 0 ? "var(--color-up)" : "var(--color-down)";
  return {
    background: `color-mix(in oklab, ${ink} ${mix}%, var(--color-surface))`,
    color: "var(--color-fg)",
  };
}
