import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board, CnnFear, Quote } from "@/lib/market/types";
import { UNIVERSE_BY_SYMBOL } from "@/lib/market/universe";
import { fmtBp, fmtCompact, fmtPrice } from "@/lib/market/format";
import { Empty, Gauge, Heat, Panel, Tone, tooltipStyle } from "@/components/dashboard/bits";

const CHARTS = ["^GSPC", "^NDX", "^GSPTSE", "^GDAXI"];

const CNN_PARTS: Record<string, { label: string; plain: string }> = {
  market_momentum_sp500: {
    label: "Market momentum",
    plain: "Is the S&P 500 above or below its average of the last 125 trading days? Above means the climb is still intact. Below means it has been sliding.",
  },
  stock_price_strength: {
    label: "Stock price strength",
    plain: "How many stocks just made a one-year high versus a one-year low. A wave of new lows is fear. A wave of new highs is greed.",
  },
  stock_price_breadth: {
    label: "Stock price breadth",
    plain: "Are the stocks that are rising also the ones being traded heavily, or is the move sitting in a few names? Thin participation scores as fear.",
  },
  put_call_options: {
    label: "Put and call options",
    plain: "A put is a bet that prices fall. A call is a bet that they rise. When people pay up for puts, they are buying insurance. CNN reads that as fear.",
  },
  market_volatility_vix: {
    label: "Market volatility",
    plain: "VIX is the price of 30-day insurance on the S&P 500. A high price means traders are nervous. CNN compares it with its own recent average.",
  },
  junk_bond_demand: {
    label: "Junk bond demand",
    plain: "Junk bonds are loans to shakier companies. When investors still want them, the extra yield they demand shrinks. That is greed. When they demand a lot extra, that is fear.",
  },
  safe_haven_demand: {
    label: "Safe haven demand",
    plain: "Stocks versus government bonds over the last 20 days. If bonds are winning, people are hiding. If stocks are winning, they are reaching for risk.",
  },
};

export function Overview({ board }: { board: Board }) {
  const by = new Map(board.quotes.map((quote) => [quote.symbol, quote]));
  const indices = board.quotes.filter((quote) => UNIVERSE_BY_SYMBOL.get(quote.symbol)?.group === "index");
  const commodities = ["GC=F", "SI=F", "CL=F", "BZ=F", "HG=F", "NG=F", "DX-Y.NYB"].map((symbol) => by.get(symbol)).filter((q): q is Quote => !!q);
  const chart = mergeCharts(CHARTS.map((symbol) => by.get(symbol)).filter((q): q is Quote => !!q));
  const spy = by.get("SPY");

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="CNN Fear and Greed" kicker="cnn.com · 0 is extreme fear, 100 is extreme greed">
          {board.fearCnn ? (
            <>
              <Gauge value={board.fearCnn.score} caption={board.fearCnn.rating} />
              <p className="mt-3 font-mono text-xs text-muted">
                Last close {board.fearCnn.previousClose ?? "—"} · Week ago {board.fearCnn.week ?? "—"} · Month ago {board.fearCnn.month ?? "—"}
              </p>
            </>
          ) : (
            <Empty title="CNN did not answer" body="The public Fear and Greed feed was quiet. The desk gauge below is still ours." />
          )}
          <p className="mt-3 text-sm text-muted">
            CNN’s number for the whole US stock market. It averages seven clues, each scored 0 to 100 against its own recent history. It is a mood, not a buy or sell signal.
          </p>
        </Panel>
        <Panel title="Desk gauge" kicker="Ours, kept as a cross-check">
          {board.fearEquity ? (
            <Gauge value={board.fearEquity.value} caption={board.fearEquity.label} />
          ) : (
            <Empty title="Gauge needs VIX and the S&P" body="Those closes did not arrive." />
          )}
          <p className="mt-3 text-sm text-muted">
            Not CNN. This blends three things we already calculate: the VIX, the share of S&P 500 stocks that rose, and how far the S&P sits from its one-year high. If it disagrees with CNN, neither one is “right.”
          </p>
        </Panel>
        <Panel title="Crypto fear and greed" kicker="Alternative.me · bitcoin, not stocks">
          {board.fearCrypto ? (
            <Gauge value={board.fearCrypto.value} caption={board.fearCrypto.label} />
          ) : (
            <Empty title="Crypto index is quiet" body="The public fear-and-greed feed did not answer." />
          )}
          <p className="mt-3 text-sm text-muted">
            A separate mood gauge for bitcoin. It uses crypto trading and search interest. A greedy stock market and a fearful bitcoin market can happen on the same day.
          </p>
        </Panel>
        <CnnParts cnn={board.fearCnn} />
        <Panel title="Breadth" kicker={board.breadth.source === "spx" ? "How many stocks rose, not just the index" : "Hand-picked book, index lists failed"} className="lg:col-span-3">
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
            Breadth is the count of members that rose versus fell. An index can rise while most of its stocks fall, if a few giants do the lifting. Flat means a move under 0.05%.
          </p>
        </Panel>
      </div>

      <Panel title="Indices, rebased to 100" kicker={`Each line starts at 100 on ${chart[0]?.d ?? board.asOf}`}>
        <p className="mb-3 text-sm text-muted">
          110 means that index is up 10% since the left edge. They are scaled this way so a 40,000 Dow can sit next to a 20,000 Nasdaq without the bigger number taking over the chart.
        </p>
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

      <p className="text-sm text-muted">1m is about one month. 1y is about one year. Both are percent changes in the price.</p>
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
        <Panel title="Liquidity" kicker="How easy it is to borrow, and how scared lenders are">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat label="10-year minus 2-year" value={board.t10y2y == null ? "—" : fmtBp(board.t10y2y)} hint="Longer Treasury loans minus shorter ones. Negative means the curve is upside down." />
            <Stat label="10-year minus 3-month" value={board.t10y3m == null ? "—" : fmtBp(board.t10y3m)} hint="Same idea, using the 3-month bill. Also a recession warning when negative." />
            <Stat label="Junk-bond extra yield" value={board.hyOas == null ? "—" : `${(board.hyOas * 100).toFixed(0)} bp`} hint="How much extra yield investors demand to lend to shaky companies. Wider means more fear." />
            <Stat label="10-year after inflation" value={board.real10 == null ? "—" : `${board.real10.toFixed(2)}%`} hint="The real yield. Higher means future profits are worth less in today’s money." />
            <Stat label="TED spread" value={board.ted ? `${board.ted.value.toFixed(2)} (${board.ted.date})` : "—"} hint="An old gap between bank borrowing and Treasury bills. It stopped updating in 2022." />
            <Stat label="10-year yield bounce" value={board.yieldVol == null ? "—" : `${board.yieldVol} bp`} hint="How much the 10-year yield has actually been jumping around. Not the MOVE index, which we do not have." />
            <Stat label="SPY shares traded" value={fmtCompact(spy?.volume ?? null)} hint="SPY is the fund that tracks the S&P 500. This is yesterday’s share count." />
            <Stat label="SPY usual volume" value={fmtCompact(spy?.avgVol20 ?? null)} hint="The average of the last 20 sessions, so you can see if yesterday was busy." />
          </dl>
          <p className="mt-4 text-sm text-muted">A basis point, written bp, is 0.01 percentage points. 25 bp is a quarter of one percent.</p>
        </Panel>
        <Panel title="Commodities and the dollar" kicker="The latest finished trading session">
          <p className="mb-3 text-sm text-muted">A front contract is the futures month closest to delivery, the usual stand-in for the spot price. The dollar line is the dollar index, a basket against other currencies.</p>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-fg">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function CnnParts({ cnn }: { cnn: CnnFear | null }) {
  if (!cnn) return null;
  return (
    <Panel title="What CNN is averaging" kicker="Each clue is already scored 0 to 100" className="lg:col-span-3">
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cnn.history}>
              <YAxis hide domain={[0, 100]} />
              <Tooltip {...tooltipStyle} />
              <Line dataKey="v" name="CNN" stroke="var(--color-fg)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted">CNN’s score over the last year. The middle of the chart is 50, a coin-flip mood.</p>
        </div>
        <div className="grid gap-3">
          {cnn.parts.map((part) => {
            const copy = CNN_PARTS[part.id];
            return (
              <div key={part.id}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span>{copy?.label ?? part.id}</span>
                  <span className="font-mono text-xs text-muted">{part.score} · {part.rating}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div className="h-full bg-fg" style={{ width: `${Math.max(2, Math.min(100, part.score))}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{copy?.plain}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
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
