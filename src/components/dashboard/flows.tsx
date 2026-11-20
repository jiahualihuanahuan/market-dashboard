import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getFlows } from "@/lib/market/board.functions";
import type { FlowBook, FlowFund } from "@/lib/market/flows.server";
import { fmtCompact } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { id: "f1", label: "1 day" },
  { id: "f5", label: "5 days" },
  { id: "f21", label: "21 days" },
] as const;

type WindowId = (typeof WINDOWS)[number]["id"];

export function FlowsTab() {
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["etf-flows"],
    queryFn: () => getFlows({ data: { live: liveRef.current } }),
    staleTime: 6 * 60 * 60 * 1000,
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

  if (query.isPending) return <p className="text-sm text-muted">Reading share counts from State Street and iShares.</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Flows did not load."}</p>;
  }
  return <FlowsDesk book={query.data} />;
}

function FlowsDesk({ book }: { book: FlowBook }) {
  const [symbol, setSymbol] = useState("SPY");
  const [windowId, setWindowId] = useState<WindowId>("f5");
  const selected = bookFund(book, symbol) ?? book.funds.find((fund) => fund.history.length) ?? book.funds[0];
  const groups = [...new Set(book.funds.map((fund) => fund.group))];
  const windowLabel = WINDOWS.find((item) => item.id === windowId)?.label ?? "5 days";

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="min-w-0" title="Creations and redemptions" kicker={selected?.asOf ? `Through ${selected.asOf}` : "Issuer files"}>
        <p className="max-w-3xl text-sm text-muted">{book.note}</p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Green is money in. Red is money out. The bars compare funds over the window you pick. Click a bar to open that fund’s daily graph. The line on the daily graph is the fund’s own price.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {WINDOWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setWindowId(item.id)}
              className={cn(
                "h-11 rounded-md border px-3 text-sm",
                windowId === item.id ? "border-fg bg-elevated text-fg" : "border-line text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title={selected ? `${selected.symbol} · ${selected.label}` : "Daily flow"}
        kicker={selected?.history.length ? `Daily flow. Running total in this window ${fmtFlow(selected.history[selected.history.length - 1]?.cum)}.` : "Daily flow"}
        className="min-w-0"
      >
        {selected && selected.history.length ? <DailyChart fund={selected} /> : <p className="text-sm text-muted">{selected?.error ?? "No history."}</p>}
      </Panel>

      {groups.map((group) => (
        <Panel key={group} className="min-w-0" title={group} kicker={`${windowLabel} of money in or out. Click a bar.`}>
          <GroupChart
            funds={book.funds.filter((fund) => fund.group === group)}
            windowId={windowId}
            symbol={selected?.symbol ?? ""}
            onPick={setSymbol}
          />
        </Panel>
      ))}
    </div>
  );
}

function DailyChart({ fund }: { fund: FlowFund }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={fund.history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="d" tick={{ fill: "var(--color-muted)", fontSize: 11 }} minTickGap={28} />
          <YAxis tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={56} />
          <YAxis yAxisId="nav" orientation="right" domain={[(min: number) => min * 0.985, (max: number) => max * 1.015]} tickFormatter={(value) => Number(value).toFixed(0)} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={48} />
          <Tooltip
            {...tooltipStyle}
            formatter={(value, name) => {
              if (name === "nav") return [typeof value === "number" ? value.toFixed(2) : value, "Price"];
              return [typeof value === "number" ? fmtFlow(value) : value, "Flow"];
            }}
          />
          <ReferenceLine y={0} stroke="var(--color-muted)" />
          <Bar dataKey="flow" name="flow" isAnimationActive={false}>
            {fund.history.map((point) => (
              <Cell key={point.d} fill={(point.flow ?? 0) >= 0 ? "var(--color-up)" : "var(--color-down)"} />
            ))}
          </Bar>
          <Line yAxisId="nav" dataKey="nav" name="nav" stroke="var(--color-accent)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function GroupChart({ funds, windowId, symbol, onPick }: { funds: FlowFund[]; windowId: WindowId; symbol: string; onPick: (symbol: string) => void }) {
  const rows = funds
    .filter((fund) => fund[windowId] != null)
    .map((fund) => ({ symbol: fund.symbol, label: fund.label, flow: fund[windowId] ?? 0 }));
  if (!rows.length) return <p className="text-sm text-muted">{funds.find((fund) => fund.error)?.error ?? "No flow for this window."}</p>;
  return (
    <div style={{ height: Math.max(160, rows.length * 36) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
          <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
          <Tooltip
            {...tooltipStyle}
            formatter={(value) => [typeof value === "number" ? fmtFlow(value) : value, "Flow"]}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as { label?: string } | undefined;
              return row?.label ? `${label} · ${row.label}` : String(label);
            }}
          />
          <ReferenceLine x={0} stroke="var(--color-muted)" />
          <Bar
            dataKey="flow"
            isAnimationActive={false}
            cursor="pointer"
            onClick={(row) => {
              const next = (row as { symbol?: string }).symbol;
              if (next) onPick(next);
            }}
          >
            {rows.map((row) => (
              <Cell key={row.symbol} fill={row.flow >= 0 ? "var(--color-up)" : "var(--color-down)"} fillOpacity={row.symbol === symbol ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function bookFund(book: FlowBook, symbol: string): FlowFund | undefined {
  return book.funds.find((fund) => fund.symbol === symbol);
}

function fmtFlow(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${fmtCompact(Math.abs(value))}`;
}
