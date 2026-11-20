import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getTechnical } from "@/lib/market/board.functions";
import { cleanSymbol, type TechBook } from "@/lib/market/technical";
import { fmtCompact, fmtPrice } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const PRESETS = ["SPY", "QQQ", "IWM", "XIU.TO", "VFV.TO", "ZWB.TO", "HXS.TO", "GLD", "TLT", "IBIT"];

export function TechnicalTab() {
  const liveRef = useRef(false);
  const [symbol, setSymbol] = useState("SPY");
  const [draft, setDraft] = useState("SPY");
  const query = useQuery({
    queryKey: ["technical", symbol],
    queryFn: () => getTechnical({ data: { symbol, live: liveRef.current } }),
    staleTime: 50_000,
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

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="min-w-0" title={query.data ? query.data.name : "Technical"} kicker="Daily closes. Averages, RSI, MACD, and bands. Not a trade signal.">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = cleanSymbol(draft);
            if (next) setSymbol(next);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Ticker"
            spellCheck={false}
            className="h-11 w-32 rounded-md border border-line bg-bg px-3 font-mono text-sm uppercase"
          />
          <button type="submit" className="h-11 rounded-md border border-line px-3 text-sm">
            Load
          </button>
        </form>
        <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto">
          {PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setDraft(item);
                setSymbol(item);
              }}
              className={cn("h-11 shrink-0 rounded-full border px-3 font-mono text-sm", symbol === item ? "border-fg text-fg" : "border-line text-muted")}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          One tool from each family: the 50- and 200-day averages for trend, RSI for momentum, Bollinger bands for stretch, and volume against its 20-day average for participation. MACD confirms the same trend; it is not a second opinion.
        </p>
      </Panel>
      {query.isPending ? <p className="text-sm text-muted">Reading two years of daily bars.</p> : null}
      {query.isError ? <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "The history did not load."}</p> : null}
      {query.data ? <TechnicalDesk book={query.data} /> : null}
    </div>
  );
}

function TechnicalDesk({ book }: { book: TechBook }) {
  const chart = book.points.map((point) => ({
    ...point,
    label: point.date.slice(5),
  }));
  return (
    <div className="grid min-w-0 gap-4">
      <Panel title={book.symbol} kicker={`${book.asOf} · ${fmtPrice(book.price)} ${book.currency}`} className="min-w-0">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Versus 200-day" value={book.stats.dist200 == null ? "—" : `${book.stats.dist200 > 0 ? "+" : ""}${book.stats.dist200.toFixed(1)}%`} note={book.read.trend} />
          <Stat label="RSI 14" value={book.stats.rsi == null ? "—" : book.stats.rsi.toFixed(1)} note={book.read.momentum} />
          <Stat label="MACD" value={book.stats.macdState} note="12/26/9 on daily closes. A cross is confirmation, and it lags." />
          <Stat label="ATR 14" value={book.stats.atrPct == null ? "—" : `${book.stats.atrPct.toFixed(2)}%`} note={book.stats.atr == null ? "No range yet." : `A typical day is about ${fmtPrice(book.stats.atr)}. ${book.stats.band}.`} />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">{book.read.summary}</p>
      </Panel>

      <Panel title="Price, averages, bands" kicker="Last 180 sessions. Pale lines are the bands." className="min-w-0">
        <div className="h-80 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 11 }} minTickGap={28} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickFormatter={(value) => fmtPrice(Number(value))} width={56} />
              <Tooltip {...tooltipStyle} formatter={(value, name) => [value == null ? "—" : fmtPrice(Number(value)), labelOf(String(name))]} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} />
              <Line type="monotone" dataKey="upper" stroke="var(--color-line)" dot={false} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="lower" stroke="var(--color-line)" dot={false} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="sma200" stroke="var(--color-warn)" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="sma50" stroke="var(--color-chart-1)" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="close" stroke="var(--color-fg)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="RSI" kicker="70 extended, 30 washed out. A trend can stay there." className="min-w-0">
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 11 }} minTickGap={28} />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={36} />
                <Tooltip {...tooltipStyle} formatter={(value) => [value == null ? "—" : Number(value).toFixed(1), "RSI"]} />
                <ReferenceLine y={70} stroke="var(--color-down)" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="var(--color-up)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="rsi" stroke="var(--color-chart-1)" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="MACD histogram" kicker="Gap between the MACD line and its 9-day signal." className="min-w-0">
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 11 }} minTickGap={28} />
                <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={48} />
                <Tooltip {...tooltipStyle} formatter={(value, name) => [value == null ? "—" : Number(value).toFixed(3), labelOf(String(name))]} />
                <ReferenceLine y={0} stroke="var(--color-muted)" />
                <Bar dataKey="hist" fill="var(--color-chart-2)" />
                <Line type="monotone" dataKey="macd" stroke="var(--color-fg)" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="signal" stroke="var(--color-warn)" dot={false} strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Last 20 sessions" kicker="Volume against its 20-day average." className="min-w-0">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                {["Date", "Close", "RSI", "MACD", "200-day", "Volume", "Vs avg"].map((heading) => (
                  <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {book.points.slice(-20).reverse().map((point) => (
                <tr key={point.date} className="border-t border-line">
                  <td className="px-2 py-2 font-mono">{point.date}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtPrice(point.close)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{point.rsi == null ? "—" : point.rsi.toFixed(1)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{point.hist == null ? "—" : point.hist.toFixed(3)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{point.sma200 == null ? "—" : fmtPrice(point.sma200)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtCompact(point.volume)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{point.volAvg ? `${(point.volume / point.volAvg).toFixed(2)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-3">
      <p className="font-mono text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  );
}

function labelOf(name: string): string {
  if (name === "close") return "Close";
  if (name === "sma50") return "50-day";
  if (name === "sma200") return "200-day";
  if (name === "upper") return "Upper band";
  if (name === "lower") return "Lower band";
  if (name === "macd") return "MACD";
  if (name === "signal") return "Signal";
  if (name === "hist") return "Histogram";
  return name;
}
