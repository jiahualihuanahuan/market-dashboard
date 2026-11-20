import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Board, Quote } from "@/lib/market/types";
import { CHAINS, UNIVERSE, UNIVERSE_BY_SYMBOL, type ChainId } from "@/lib/market/universe";
import { fmtPrice } from "@/lib/market/format";
import { Panel, Tone, Heat, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { getCommodityChart, getCommodityRatio } from "@/lib/market/board.functions";
import { COMMODITY_CHARTS } from "@/lib/market/commodity";
import { RANGES, percentChange, sliceSeries, type RangeId } from "@/lib/market/tape";

const SPOTS = ["GC=F", "SI=F", "CL=F", "BZ=F", "HG=F", "NG=F", "DX-Y.NYB"];

const RATIO_ETF: Partial<Record<ChainId, string>> = {
  gold: "GDX",
  silver: "SIL",
  copper: "COPX",
  energy: "XLE",
  uranium: "URNM",
};

export function Commodities({ board }: { board: Board }) {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const [chain, setChain] = useState<ChainId>("gold");
  const by = useMemo(() => new Map(board.quotes.map((quote) => [quote.symbol, quote])), [board.quotes]);
  const active = CHAINS.find((item) => item.id === chain) ?? CHAINS[0];
  const members = UNIVERSE.filter((item) => item.chain === chain)
    .map((item) => by.get(item.symbol))
    .filter((quote): quote is Quote => !!quote);
  const selected = by.get(search.symbol);

  const spots = SPOTS.map((symbol) => by.get(symbol)).filter((quote): quote is Quote => !!quote);

  return (
    <div className="grid gap-4">
      <CommodityPrice />
      <Panel title="Commodities and the dollar" kicker="The latest finished trading session">
        <p className="mb-3 text-sm text-muted">A front contract is the futures month closest to delivery, the usual stand-in for the spot price. The dollar line is the dollar index, a basket against other currencies.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {spots.map((quote) => (
            <div key={quote.symbol} className="flex items-center justify-between gap-3 border-b border-line py-2">
              <div>
                <p className="text-sm">{UNIVERSE_BY_SYMBOL.get(quote.symbol)?.label}</p>
                <p className="font-mono text-xs text-muted">{quote.symbol}</p>
              </div>
              <p className="font-mono tabular-nums">{fmtPrice(quote.price)}</p>
              <Heat value={quote.d1} />
            </div>
          ))}
        </div>
      </Panel>
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
            const ratioName = quote.symbol === RATIO_ETF[chain];
            const rich = ratioName && quote.divergence != null && quote.divergence >= 1.5;
            const cheap = ratioName && quote.divergence != null && quote.divergence <= -1.5;
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
                {ratioName && quote.divergence != null ? (
                  <p className="mt-2 text-xs text-muted">
                    Miner fund / spot, {quote.divergence.toFixed(2)} versus the last 60 sessions
                    {rich ? " · rich vs spot" : ""}
                    {cheap ? " · cheap vs spot" : ""}
                  </p>
                ) : meta?.role === "spot" ? (
                  <p className="mt-2 text-xs text-muted">Spot price</p>
                ) : null}
              </button>
            );
          })}
        </div>
        <RatioChart chain={chain} />
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
              {selected.symbol === RATIO_ETF[chain] && selected.divergence != null ? (
                <p className="mt-3 text-sm text-muted">
                  Miner fund divided by spot, versus the last 60 sessions: {selected.divergence.toFixed(2)}. Past 1.5 either way is unusual. Not a signal to trade.
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
    </div>
  );
}

function CommodityPrice() {
  const [symbol, setSymbol] = useState("GC=F");
  const [range, setRange] = useState<RangeId>("y1");
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["commodity-chart", symbol],
    queryFn: () => {
      const live = liveRef.current;
      liveRef.current = false;
      return getCommodityChart({ data: { symbol, live } });
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    const onRefresh = () => {
      liveRef.current = true;
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);
  const chart = query.data;
  const line = useMemo(() => {
    if (!chart) return [];
    if (range === "day" && chart.day.length > 1) return chart.day;
    return sliceSeries(chart.daily, range === "day" ? "week" : range);
  }, [chart, range]);
  const change = useMemo(() => {
    if (!chart) return null;
    if (range === "day" && chart.day.length > 1) {
      const first = chart.day[0]?.v;
      const last = chart.day[chart.day.length - 1]?.v;
      if (!(first > 0) || !(last > 0)) return null;
      return Math.round((last / first - 1) * 10000) / 100;
    }
    return percentChange(chart.daily.map((point) => point.v), chart.daily.map((point) => point.d), range === "day" ? "week" : range);
  }, [chart, range]);
  const label = chart?.label ?? COMMODITY_CHARTS.find((item) => item.symbol === symbol)?.label ?? "Commodity";
  return (
    <Panel className="min-w-0" title={label} kicker="Price over the window you pick">
      <p className="mb-3 text-sm text-muted">
        {range === "day"
          ? chart && chart.day.length > 1
            ? "Day is the latest session in five-minute steps."
            : "Day falls back to the last week of closes when the session tape is missing."
          : "This window is daily closes, the same ranges as the index chart."}{" "}
        {change == null ? "" : <Tone value={change} />}
      </p>
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {COMMODITY_CHARTS.map((item) => (
          <button
            key={item.symbol}
            type="button"
            onClick={() => setSymbol(item.symbol)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-3 text-sm",
              symbol === item.symbol ? "border-fg bg-elevated text-fg" : "border-line text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {RANGES.map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRange(id)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-3 text-sm",
              range === id ? "border-fg bg-elevated text-fg" : "border-line text-muted",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      {query.isPending ? <p className="mt-3 text-sm text-muted">Reading the price history.</p> : null}
      {query.isError ? <p className="mt-3 text-sm text-muted">{query.error instanceof Error ? query.error.message : "The price history did not load."}</p> : null}
      {line.length > 1 ? (
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={line} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={28} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={64} tickFormatter={(value) => fmtPrice(Number(value))} />
              <Tooltip {...tooltipStyle} formatter={(value) => [fmtPrice(typeof value === "number" ? value : null), label]} />
              <Line dataKey="v" name={label} stroke="var(--color-fg)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Panel>
  );
}

function RatioChart({ chain }: { chain: ChainId }) {
  const [range, setRange] = useState<RangeId>("y1");
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["commodity-ratio", chain],
    queryFn: () => {
      const live = liveRef.current;
      liveRef.current = false;
      return getCommodityRatio({ data: { chain, live } });
    },
    enabled: chain !== "ag",
    staleTime: 60_000,
  });
  useEffect(() => {
    const onRefresh = () => {
      liveRef.current = true;
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);
  if (chain === "ag") {
    return (
      <p className="mt-4 text-sm text-muted">
        Agriculture uses DBA itself as the benchmark, so there is no separate miner ETF to ratio against spot.
      </p>
    );
  }
  const book = query.data;
  const view = useMemo(() => (book ? ratioWindow(book, range) : null), [book, range]);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-3">
        <p className="text-sm font-medium">{book ? `${book.etfLabel} / ${book.spotLabel}` : "Miner fund / spot"}</p>
        <p className="text-xs text-muted">
          The miner fund divided by the spot price. Zero is the average inside the window you pick. The dashed lines are 1.5 standard deviations for that same window. Past either line, the relationship is unusual for this stretch of time, not a signal to trade.
        </p>
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {RANGES.map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRange(id)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-3 text-sm",
              range === id ? "border-fg bg-elevated text-fg" : "border-line text-muted",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      {query.isPending ? <p className="text-sm text-muted">Reading the miner fund and the spot price.</p> : null}
      {query.isError ? <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "The ratio did not load."}</p> : null}
      {book && !view ? <p className="text-sm text-muted">Not enough overlapping prices in this window.</p> : null}
      {view ? (
        <>
          <p className={cn("mb-2 font-mono text-sm tabular-nums", view.outside ? "text-warn" : "text-muted")}>
            {view.gap > 0 ? "+" : ""}{view.gap.toFixed(1)}%
            <span className="ml-2 text-xs">{view.outside ? (view.rich ? "Rich" : "Cheap") : "Usual"} · {view.z.toFixed(1)}σ</span>
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={view.points} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={28} tickFormatter={(value: string) => (range === "day" ? value : value.slice(5))} />
                <YAxis
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  width={44}
                  unit="%"
                  domain={[(dataMin: number) => Math.min(dataMin, -view.band * 1.2), (dataMax: number) => Math.max(dataMax, view.band * 1.2)]}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value) => {
                    const number = Number(value);
                    return [`${number > 0 ? "+" : ""}${number.toFixed(1)}%`, "Miner fund / spot"];
                  }}
                />
                <ReferenceLine y={0} stroke="var(--color-muted)" strokeDasharray="3 3" />
                <ReferenceLine y={view.band} stroke="var(--color-warn)" strokeDasharray="5 4" label={{ value: "Rich", fill: "var(--color-warn)", fontSize: 11, position: "insideTopRight" }} />
                <ReferenceLine y={-view.band} stroke="var(--color-warn)" strokeDasharray="5 4" label={{ value: "Cheap", fill: "var(--color-warn)", fontSize: 11, position: "insideBottomRight" }} />
                <Line dataKey="gap" name="gap" stroke="var(--color-accent)" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-muted">
            {view.outside
              ? `${book?.etfLabel} is ${view.rich ? "rich" : "cheap"} versus ${book?.spotLabel} over this window.`
              : `${book?.etfLabel} versus ${book?.spotLabel} is inside a normal range for this window.`}
            {" "}Rich means the miner fund is expensive versus the metal. Cheap means the metal has run ahead of the miners.
          </p>
        </>
      ) : null}
    </div>
  );
}

function ratioWindow(book: { daily: { d: string; ratio: number }[]; day: { d: string; ratio: number }[] }, range: RangeId) {
  const source = range === "day" && book.day.length > 4 ? book.day : sliceSeries(book.daily, range === "day" ? "week" : range);
  if (source.length < 4) return null;
  const mean = source.reduce((sum, row) => sum + row.ratio, 0) / source.length;
  const variance = source.reduce((sum, row) => sum + (row.ratio - mean) ** 2, 0) / source.length;
  const sd = Math.sqrt(variance);
  if (!(mean > 0) || !(sd > 1e-10)) return null;
  const last = source[source.length - 1];
  const gap = ((last.ratio / mean) - 1) * 100;
  const z = (last.ratio - mean) / sd;
  const band = (1.5 * sd / mean) * 100;
  return {
    gap,
    z,
    band,
    outside: Math.abs(z) >= 1.5,
    rich: z >= 1.5,
    points: source.map((row) => ({ d: row.d, gap: ((row.ratio / mean) - 1) * 100 })),
  };
}
