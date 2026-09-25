import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getFlows } from "@/lib/market/board.functions";
import type { FlowBook, FlowFund } from "@/lib/market/flows.server";
import { fmtCompact, fmtPct } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

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
  const selected = bookFund(book, symbol) ?? book.funds.find((fund) => fund.history.length) ?? book.funds[0];
  const spy = book.funds.find((fund) => fund.symbol === "SPY");
  const groups = [...new Set(book.funds.map((fund) => fund.group))];
  const flags = book.funds.filter((fund) => fund.signal.startsWith("Price up, money leaving") || fund.signal.startsWith("Price down, money arriving"));

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="min-w-0" title="Creations and redemptions" kicker={spy ? `Through ${spy.asOf}` : "Issuer files"}>
        <p className="max-w-3xl text-sm text-muted">{book.note}</p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          A disagreement is the signal. Price up with money leaving means the market price rose while the fund was redeeming shares, so the buyers were not the same people adding new ETF shares. It is a disagreement, not a forecast. A move under 0.15% or a flow under 0.1% of assets is treated as quiet.
        </p>
        {spy ? (
          <p className="mt-3 text-sm">
            SPY is {fmtPct(spy.d5)} over five sessions, with {fmtFlow(spy.f5)} created or redeemed.
            {" "}
            <span className={tone(spy.signal)}>{spy.signal}.</span>
          </p>
        ) : null}
        {flags.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {flags.map((fund) => (
              <li key={fund.symbol}>
                <button
                  type="button"
                  onClick={() => setSymbol(fund.symbol)}
                  className="flex min-h-11 w-full flex-col items-start rounded-md border border-line px-3 py-2 text-left hover:bg-elevated"
                >
                  <span className="font-mono text-sm">{fund.symbol} <span className="text-muted">{fund.label}</span></span>
                  <span className={cn("text-sm", tone(fund.signal))}>{fund.signal}</span>
                  <span className="font-mono text-xs tabular-nums text-muted">{fmtPct(fund.d5)} · {fmtFlow(fund.f5)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No fund in this list has a five-day disagreement right now.</p>
        )}
      </Panel>

      <Panel
        title={selected ? `${selected.symbol} · ${selected.label}` : "History"}
        kicker={selected?.history.length ? `Daily flow. Running total in this window ${fmtFlow(selected.history[selected.history.length - 1]?.cum)}.` : "Daily flow"}
        className="min-w-0"
      >
        {selected && selected.history.length ? (
          <>
            <p className="mb-2 text-xs text-muted">Green bars are shares created. Red bars are shares redeemed. The line is the fund's own net asset value, so you can see price and flow together.</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={selected.history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: "var(--color-muted)", fontSize: 11 }} minTickGap={28} />
                  <YAxis tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={56} />
                  <YAxis yAxisId="nav" orientation="right" domain={[(min: number) => min * 0.985, (max: number) => max * 1.015]} tickFormatter={(value) => Number(value).toFixed(0)} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={48} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value, name) => {
                      if (name === "nav") return [typeof value === "number" ? value.toFixed(2) : value, "NAV"];
                      return [typeof value === "number" ? fmtFlow(value) : value, "Flow"];
                    }}
                  />
                  <Bar dataKey="flow" name="flow" isAnimationActive={false}>
                    {selected.history.map((point) => (
                      <Cell key={point.d} fill={(point.flow ?? 0) >= 0 ? "var(--color-up)" : "var(--color-down)"} />
                    ))}
                  </Bar>
                  <Line yAxisId="nav" dataKey="nav" name="nav" stroke="var(--color-accent)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{selected?.error ?? "No history."}</p>
        )}
      </Panel>

      {groups.map((group) => (
        <Panel key={group} className="min-w-0" title={group} kicker="Five-day flow is the main signal. One day and one month sit beside it. Click a row for the chart.">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Fund</th>
                  <th className="px-2 py-2 font-medium">Assets</th>
                  <th className="px-2 py-2 font-medium">1 day</th>
                  <th className="px-2 py-2 font-medium">5-day price</th>
                  <th className="px-2 py-2 font-medium">5-day flow</th>
                  <th className="px-2 py-2 font-medium">vs assets</th>
                  <th className="px-2 py-2 font-medium">21-day flow</th>
                  <th className="px-2 py-2 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {book.funds.filter((fund) => fund.group === group).map((fund) => (
                  <tr
                    key={fund.symbol}
                    className={cn("cursor-pointer border-t border-line", fund.symbol === selected?.symbol && "bg-elevated")}
                    onClick={() => setSymbol(fund.symbol)}
                  >
                    <td className="py-3 pr-3">
                      <span className="font-mono">{fund.symbol}</span>
                      <span className="ml-2 text-muted">{fund.label}</span>
                    </td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fund.aum == null ? "—" : `$${fmtCompact(fund.aum)}`}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fmtFlow(fund.f1)}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fmtPct(fund.d5)}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fmtFlow(fund.f5)}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fmtShare(fund.f5, fund.aum)}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fmtFlow(fund.f21)}</td>
                    <td className={cn("px-2 py-3", tone(fund.signal))}>{fund.error ? fund.error : fund.signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
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

function fmtShare(flow: number | null, aum: number | null): string {
  if (flow == null || aum == null || !(aum > 0)) return "—";
  return fmtPct((flow / aum) * 100);
}

function tone(signal: string): string {
  if (signal.startsWith("Price up, money leaving") || signal.startsWith("Price down, money arriving")) return "text-warn";
  if (signal.includes("leaving")) return "text-down";
  if (signal.includes("arriving")) return "text-up";
  return "text-muted";
}
