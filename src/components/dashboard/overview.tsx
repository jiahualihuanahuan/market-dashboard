import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board, Quote } from "@/lib/market/types";
import { UNIVERSE_BY_SYMBOL } from "@/lib/market/universe";
import { fmtBp, fmtCompact, fmtPrice } from "@/lib/market/format";
import { Empty, Gauge, Heat, Panel, Tone, tooltipStyle } from "@/components/dashboard/bits";

const CHARTS = ["^GSPC", "^NDX", "^GSPTSE", "^GDAXI"];

export function Overview({ board }: { board: Board }) {
  const by = new Map(board.quotes.map((quote) => [quote.symbol, quote]));
  const indices = board.quotes.filter((quote) => UNIVERSE_BY_SYMBOL.get(quote.symbol)?.group === "index");
  const commodities = ["GC=F", "SI=F", "CL=F", "BZ=F", "HG=F", "NG=F", "DX-Y.NYB"].map((symbol) => by.get(symbol)).filter((q): q is Quote => !!q);
  const chart = mergeCharts(CHARTS.map((symbol) => by.get(symbol)).filter((q): q is Quote => !!q));
  const spy = by.get("SPY");

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Equity gauge" kicker="Not the CNN index" className="lg:col-span-1">
          {board.fearEquity ? (
            <Gauge value={board.fearEquity.value} caption={board.fearEquity.label} />
          ) : (
            <Empty title="Gauge needs VIX and the S&P" body="Those closes did not arrive." />
          )}
          <p className="mt-3 text-sm text-muted">
            Blend of VIX, share of the {board.breadth.source === "spx" ? "S&P 500" : "tracked book"} that rose, and how far the S&P sits from its 52-week high.
          </p>
        </Panel>
        <Panel title="Crypto fear and greed" kicker="Alternative.me">
          {board.fearCrypto ? (
            <Gauge value={board.fearCrypto.value} caption={board.fearCrypto.label} />
          ) : (
            <Empty title="Crypto index is quiet" body="The public fear-and-greed feed did not answer." />
          )}
        </Panel>
        <Panel title="Breadth" kicker={board.breadth.source === "spx" ? "Full index membership" : "Hand-picked book, index lists failed"} className="lg:col-span-3">
          <div className="grid gap-3">
            {(board.breadth.indexes ?? []).map((row) => {
              const total = row.covered || row.listed;
              const upPct = total ? Math.round((row.up / total) * 100) : 0;
              const downPct = total ? Math.round((row.down / total) * 100) : 0;
              const flatPct = Math.max(0, 100 - upPct - downPct);
              return (
                <div key={row.symbol}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span>{row.label}</span>
                    {row.covered ? (
                      <span className="font-mono text-xs text-muted">
                        {row.up} up · {row.down} down · {row.flat} flat · {row.covered} of {row.listed}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">No public membership list</span>
                    )}
                  </div>
                  {row.covered ? (
                    <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
                      <div className="bg-up" style={{ width: `${upPct}%` }} />
                      <div className="bg-line" style={{ width: `${flatPct}%` }} />
                      <div className="bg-down" style={{ width: `${downPct}%` }} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            The old “68 names” figure was not an index. It was every equity typed into this desk by hand: miners, banks, and a few stocks per sector. These bars count the actual members of the indexes on this page. Flat means a move under 0.05%.
          </p>
        </Panel>
      </div>

      <Panel title="Indices, rebased to 100" kicker={`From ${chart[0]?.d ?? board.asOf}`}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={32} />
              <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={40} domain={["auto", "auto"]} />
              <Tooltip {...tooltipStyle} />
              <Line dataKey="SPX" name="S&P 500" stroke="var(--color-fg)" dot={false} strokeWidth={2} />
              <Line dataKey="NDX" name="Nasdaq-100" stroke="var(--color-up)" dot={false} strokeWidth={1.5} />
              <Line dataKey="TSX" name="TSX" stroke="var(--color-warn)" dot={false} strokeWidth={1.5} />
              <Line dataKey="DAX" name="DAX" stroke="var(--color-muted)" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {indices.map((quote) => (
          <article key={quote.symbol} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">{UNIVERSE_BY_SYMBOL.get(quote.symbol)?.label ?? quote.name}</h3>
              <Tone value={quote.d1} />
            </div>
            <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">{fmtPrice(quote.price)}</p>
            <p className="mt-2 flex gap-3 text-xs text-muted">
              <span>1m <Tone value={quote.m1} /></span>
              <span>1y <Tone value={quote.y1} /></span>
            </p>
            {UNIVERSE_BY_SYMBOL.get(quote.symbol)?.note ? (
              <p className="mt-2 text-xs text-muted">{UNIVERSE_BY_SYMBOL.get(quote.symbol)?.note}</p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Liquidity" kicker="What is actually on the public feeds">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat label="10y–2y" value={board.t10y2y == null ? "—" : fmtBp(board.t10y2y)} />
            <Stat label="10y–3m" value={board.t10y3m == null ? "—" : fmtBp(board.t10y3m)} />
            <Stat label="HY OAS" value={board.hyOas == null ? "—" : `${(board.hyOas * 100).toFixed(0)} bp`} />
            <Stat label="10y real yield" value={board.real10 == null ? "—" : `${board.real10.toFixed(2)}%`} />
            <Stat label="TED spread" value={board.ted ? `${board.ted.value.toFixed(2)} (${board.ted.date})` : "—"} />
            <Stat label="10y realized vol" value={board.yieldVol == null ? "—" : `${board.yieldVol} bp`} />
            <Stat label="SPY session volume" value={fmtCompact(spy?.volume ?? null)} />
            <Stat label="SPY 20-day avg volume" value={fmtCompact(spy?.avgVol20 ?? null)} />
          </dl>
          <p className="mt-4 text-sm text-muted">
            TED stopped updating in 2022, so it is a relic, not a live stress gauge. MOVE is not on the price feed; the vol figure is the annualized realized move of the 10-year yield, in basis points. HY OAS is the ICE BofA high-yield spread.
          </p>
        </Panel>
        <Panel title="Commodities and the dollar" kicker="Front contract, last completed session">
          <div className="grid gap-2">
            {commodities.map((quote) => (
              <div key={quote.symbol} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
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
      </div>
      <p className="text-sm text-muted">{board.crossCheck}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function mergeCharts(quotes: Quote[]) {
  const keys = ["SPX", "NDX", "TSX", "DAX"] as const;
  const base = quotes[0];
  if (!base) return [];
  return base.spark.map((point) => {
    const row: Record<string, string | number | null> = { d: point.d };
    quotes.forEach((quote, index) => {
      const first = quote.spark[0]?.v;
      const match = closest(quote.spark, point.d);
      row[keys[index] ?? quote.symbol] = first && match ? Math.round((match.v / first) * 1000) / 10 : null;
    });
    return row;
  });
}

function closest(points: { d: string; v: number }[], date: string) {
  let best = points[0];
  let gap = Infinity;
  const target = Date.parse(date);
  for (const point of points) {
    const next = Math.abs(Date.parse(point.d) - target);
    if (next < gap) {
      gap = next;
      best = point;
    }
  }
  return gap < 5 * 86400000 ? best : null;
}
