import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getOptions } from "@/lib/market/board.functions";
import {
  ALL_EXPIRIES,
  atmIv,
  atmStrike,
  buildRows,
  chartWindow,
  cleanSymbol,
  daysUntil,
  expectedMove,
  expiryKey,
  ivVerdict,
  maxPain,
  nearestExpiry,
  openInterest,
  termRows,
  type OptBook,
  type StrikeRow,
} from "@/lib/market/options";
import { fmtCompact, fmtPrice } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const PRESETS = ["SPY", "QQQ", "IWM", "AAPL", "NVDA", "TSLA", "META", "AMZN", "GLD", "TLT", "IBIT"];

const GLOSSARY = [
  ["Delta", "How much the option price moves when the share rises by $1. A call delta of 0.40 means about 40 cents higher. Put delta is negative, because a put loses value when the share rises."],
  ["Gamma", "How fast delta itself changes. High gamma means a small share move swings the hedge a lot. It is largest when the strike is near the share price and expiry is close."],
  ["Theta", "How much value the option is priced to lose in one day if the share does not move. Buyers usually see a negative number. That is time passing, not the share falling."],
  ["Vega", "How much the option price changes if implied volatility rises by 1 percentage point, for example from 20% to 21%. High vega means you are paying for uncertainty itself."],
  ["Rho", "How much the option price changes if the interest rate in the model rises by 1 percentage point. It is usually small on options that expire soon."],
  ["Implied volatility", "The yearly move baked into the option price. 20% means the price assumes a typical year where the share wanders about 20%. It is not a forecast that the share will rise 20%."],
  ["Open interest", "Contracts that are still open. A large number means a lot of old bets are still on the books. It is not, by itself, bullish or bearish."],
  ["Max pain", "The price where those open contracts would pay holders the least if the share sat there at expiry. It is a map of the bets, not a magnet."],
];

export function OptionsTab() {
  const liveRef = useRef(false);
  const [symbol, setSymbol] = useState("SPY");
  const [draft, setDraft] = useState("SPY");
  const query = useQuery({
    queryKey: ["options", symbol],
    queryFn: () => getOptions({ data: { symbol, live: liveRef.current } }),
    staleTime: 3 * 60 * 1000,
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
      <Panel className="min-w-0" title={query.data ? query.data.name : "Option chain"} kicker="Stocks and ETFs. Prices from the listed chain, Greeks from a model.">
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
            className="h-11 w-28 rounded-md border border-line bg-bg px-3 font-mono text-sm uppercase"
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
          Pick one expiry, or the combined book of every expiry. Open interest is the size of the still-open bets. Implied volatility is whether that bet is priced rich or cheap versus how the share has actually moved. The Greeks translate one option's price into everyday effects. They are not a signal to buy or sell.
        </p>
      </Panel>
      {query.isPending ? <p className="text-sm text-muted">Reading every listed expiry, then the open contracts.</p> : null}
      {query.isError ? <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "The option chain did not load."}</p> : null}
      {query.data ? <OptionsDesk book={query.data} /> : null}
    </div>
  );
}

function OptionsDesk({ book }: { book: OptBook }) {
  const [expiry, setExpiry] = useState(ALL_EXPIRIES);
  const [strike, setStrike] = useState<number | null>(null);
  const now = useMemo(() => Date.now(), [book]);
  const rows = useMemo(() => buildRows(book, expiry, now), [book, expiry, now]);
  const focus = expiry === ALL_EXPIRIES ? nearestExpiry(book, now) : book.expiries.find((item) => expiryKey(item) === expiry) ?? null;
  const focusRows = useMemo(() => (focus ? buildRows(book, expiryKey(focus), now) : rows), [book, focus, now, rows]);
  const pain = maxPain(rows);
  const interest = openInterest(rows);
  const ivRows = expiry === ALL_EXPIRIES ? focusRows : rows;
  const iv = atmIv(ivRows, book.price);
  const judgedDays = focus ? daysUntil(focus.ts, now) : 0;
  const verdict = judgedDays < 2
    ? {
        label: "Too close to judge" as const,
        detail: "This expiry is today or tomorrow. A few hours of premium, stretched into a yearly percentage, jumps around. Use the dollar priced range, or pick a later date, before calling the option expensive or cheap.",
      }
    : ivVerdict(iv, book.realized20);
  const move = focus ? expectedMove(book.price, iv, focus.ts, now) : null;
  const terms = useMemo(() => termRows(book, now), [book, now]);
  const plotted = chartWindow(rows, book.price, pain);
  const chart = plotted.map((row) => ({
    strike: row.strike,
    callOi: row.call?.oi ?? 0,
    putOi: row.put?.oi ?? 0,
    callIv: row.call?.iv != null ? Math.round(row.call.iv * 1000) / 10 : null,
    putIv: row.put?.iv != null ? Math.round(row.put.iv * 1000) / 10 : null,
  }));
  const spotMark = nearestMark(chart, book.price);
  const painMark = pain == null ? null : nearestMark(chart, pain);
  const chosen = strike ?? atmStrike(focusRows, book.price);
  const greekRow = focusRows.find((row) => row.strike === chosen) ?? null;

  useEffect(() => {
    const focusExpiry = expiry === ALL_EXPIRIES ? nearestExpiry(book, now) : book.expiries.find((item) => expiryKey(item) === expiry) ?? null;
    const source = focusExpiry ? buildRows(book, expiryKey(focusExpiry), now) : rows;
    setStrike(atmStrike(source, book.price));
  }, [book, expiry, now, rows]);

  const ratio = interest.calls > 0 ? interest.puts / interest.calls : null;
  const distance = pain != null && book.price > 0 ? ((pain - book.price) / book.price) * 100 : null;

  return (
    <div className="grid min-w-0 gap-4">
      <Panel
        title={expiry === ALL_EXPIRIES ? "Every expiry, added together" : focus ? formatExpiry(focus.ts) : "Expiry"}
        className="min-w-0"
        kicker={`${book.symbol} · ${book.kind} · ${fmtPrice(book.price)} ${book.currency}`}
        action={
          <select
            aria-label="Expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            className="h-11 max-w-[16rem] rounded-md border border-line bg-surface px-3 text-sm"
          >
            <option value={ALL_EXPIRIES}>All expiries (combined)</option>
            {book.expiries.map((item) => (
              <option key={item.ts} value={expiryKey(item)}>
                {formatExpiry(item.ts)}
              </option>
            ))}
          </select>
        }
      >
        {expiry === ALL_EXPIRIES ? (
          <p className="mb-3 max-w-3xl text-sm text-muted">
            Combined sums open contracts from every date as if they settled at one price. A contract that expires this week is not the same bet as one that expires next year, so the Greek numbers stay on the nearest expiry{focus ? `, ${formatExpiry(focus.ts)}` : ""}.
          </p>
        ) : null}
        {book.missed > 0 ? <p className="mb-3 text-sm text-muted">{book.missed} expiry dates did not load, so the combined book is short those contracts.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Share price" value={fmtPrice(book.price)} note="The latest trade on the feed. The strike grid is built around this price." />
          <Stat
            label="Max pain"
            value={pain == null ? "—" : fmtPrice(pain)}
            note={pain == null ? "No open contracts to place it." : `${distance == null ? "" : `${fmtSigned(distance)} from the share. `}The open contracts would pay holders the least if the share sat here.`}
          />
          <Stat
            label="Put / call open interest"
            value={ratio == null ? "—" : ratio.toFixed(2)}
            note={ratio == null ? "No call contracts are open." : ratio > 1.15 ? "More put contracts are open than calls." : ratio < 0.85 ? "More call contracts are open than puts." : "Call and put open interest are in a similar range."}
          />
          <Stat label={verdict.label} value={iv == null ? "—" : `${(iv * 100).toFixed(1)}%`} note={verdict.detail} />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          {move != null && focus
            ? `The nearest priced range into ${formatExpiry(focus.ts)} is about ${fmtPrice(book.price - move)} to ${fmtPrice(book.price + move)}. That is one typical move implied by the at-the-money option, not a target.`
            : "The priced range needs an implied volatility on the at-the-money strike."}
          {book.realized60 != null ? ` Over 60 sessions the share has moved about ${(book.realized60 * 100).toFixed(1)}% annualized.` : ""}
          {" "}Open interest {fmtCompact(interest.calls)} calls and {fmtCompact(interest.puts)} puts. Today's volume {fmtCompact(interest.callVolume)} calls and {fmtCompact(interest.putVolume)} puts. Volume is what traded today. Open interest is what is still on the books.
        </p>
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Open interest by strike" kicker="Taller bar, more contracts still open." className="min-w-0">
          <p className="mb-3 text-sm text-muted">Green bars are call contracts. Red bars are puts. The pale line is the share price. The gold line is max pain.</p>
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="strike" tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickFormatter={(value) => fmtPrice(Number(value))} minTickGap={24} />
                <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickFormatter={(value) => fmtCompact(Number(value))} width={48} />
                <Tooltip {...tooltipStyle} formatter={(value, name) => [fmtCompact(Number(value)), name === "callOi" ? "Call open interest" : "Put open interest"]} labelFormatter={(value) => `Strike ${fmtPrice(Number(value))}`} />
                <Bar dataKey="callOi" fill="var(--color-up)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="putOi" fill="var(--color-down)" radius={[2, 2, 0, 0]} />
                {spotMark != null ? <ReferenceLine x={spotMark} stroke="var(--color-chart-1)" strokeDasharray="4 4" label={{ value: "Price", fill: "var(--color-muted)", fontSize: 11 }} /> : null}
                {painMark != null && painMark !== spotMark ? <ReferenceLine x={painMark} stroke="var(--color-warn)" label={{ value: "Max pain", fill: "var(--color-warn)", fontSize: 11 }} /> : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Implied volatility by strike" kicker="The smile is the price of uncertainty at each strike." className="min-w-0">
          <p className="mb-3 text-sm text-muted">
            {verdict.detail} {expiry === ALL_EXPIRIES ? "On the combined view this line is the open-interest-weighted average across dates, which mixes short and long contracts." : "This is the selected expiry only."} A higher line means that strike is priced as more uncertain. Deep strikes can look wild because a cheap option still implies a huge percentage move.
          </p>
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="strike" tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickFormatter={(value) => fmtPrice(Number(value))} minTickGap={24} />
                <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickFormatter={(value) => `${value}%`} width={48} />
                <Tooltip {...tooltipStyle} formatter={(value, name) => [value == null ? "—" : `${Number(value).toFixed(1)}%`, name === "callIv" ? "Call implied vol" : "Put implied vol"]} labelFormatter={(value) => `Strike ${fmtPrice(Number(value))}`} />
                <Line type="monotone" dataKey="callIv" stroke="var(--color-up)" dot={false} connectNulls strokeWidth={2} />
                <Line type="monotone" dataKey="putIv" stroke="var(--color-down)" dot={false} connectNulls strokeWidth={2} />
                {spotMark != null ? <ReferenceLine x={spotMark} stroke="var(--color-chart-1)" strokeDasharray="4 4" /> : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel className="min-w-0" title={greekRow ? `Greeks at ${fmtPrice(greekRow.strike)}` : "Greeks"} kicker={focus ? `Model for ${formatExpiry(focus.ts)}. ${book.rateLabel}. Dividend yield ${(book.dividend * 100).toFixed(2)}%.` : "No expiry"}>
        <p className="mb-3 max-w-3xl text-sm text-muted">
          Click a strike in the table to pin it. Delta, gamma, theta, vega, and rho are calculated from the option's own implied volatility. The model assumes a smooth bell-curve move and a steady dividend. Shares gap. Read these as a translation of the price, not a promise.
        </p>
        {greekRow ? (
          <div className="grid gap-3 md:grid-cols-2">
            <GreekCard title="Call" side="call" row={greekRow} />
            <GreekCard title="Put" side="put" row={greekRow} />
          </div>
        ) : (
          <p className="text-sm text-muted">That strike is not listed on the expiry used for the Greeks.</p>
        )}
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term} className="rounded-lg border border-line px-3 py-2">
              <dt className="text-sm font-medium">{term}</dt>
              <dd className="mt-1 text-sm text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="At the money, every expiry" kicker="The strike closest to the share price on that date." className="min-w-0">
        <p className="mb-3 max-w-3xl text-sm text-muted">
          At the money means the strike nearest the share price. Call delta near 0.50 is a coin-flip contract. Theta gets more negative as expiry gets close, because the same dollar of time value has fewer days to live. Vega is usually larger on long-dated contracts.
        </p>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                {["Expiry", "Days", "Implied vol", "Max pain", "Call delta", "Put delta", "Theta", "Vega", "Priced range", "Call OI", "Put OI"].map((heading) => (
                  <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {terms.map((row) => (
                <tr key={row.ts} className="border-t border-line">
                  <td className="px-2 py-2">{formatExpiry(row.ts)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{Math.round(row.days)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{row.iv == null ? "—" : `${(row.iv * 100).toFixed(1)}%`}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{row.pain == null ? "—" : fmtPrice(row.pain)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtGreek(row.callDelta, 2)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtGreek(row.putDelta, 2)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtGreek(row.theta, 2)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtGreek(row.vega, 2)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{row.move == null ? "—" : `±${fmtPrice(row.move)}`}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtCompact(row.callOi)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{fmtCompact(row.putOi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Strike chain" kicker={expiry === ALL_EXPIRIES ? "Open interest and volume are added across every expiry. Last price and delta are blank, because each date has its own price and its own time left." : "Click a row to read its Greeks."} className="min-w-0">
        <div className="max-h-[32rem] max-w-full overflow-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                {["Call last", "Call IV", "Call OI", "Call vol", "Call delta", "Strike", "Put delta", "Put vol", "Put OI", "Put IV", "Put last"].map((heading) => (
                  <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const on = row.strike === chosen;
                const painRow = row.strike === pain;
                return (
                  <tr
                    key={row.strike}
                    onClick={() => setStrike(row.strike)}
                    className={cn("cursor-pointer border-t border-line", on ? "bg-elevated" : "hover:bg-bg", painRow && "outline outline-1 outline-[var(--color-warn)]")}
                  >
                    <Td>{fmtPrice(row.call?.last)}</Td>
                    <Td>{fmtIv(row.call?.iv)}</Td>
                    <Td>{fmtCompact(row.call?.oi ?? 0)}</Td>
                    <Td>{fmtCompact(row.call?.volume ?? 0)}</Td>
                    <Td>{fmtGreek(row.call?.greeks?.delta ?? null, 2)}</Td>
                    <td className="px-2 py-2 font-mono font-medium tabular-nums">{fmtPrice(row.strike)}{painRow ? " · pain" : ""}</td>
                    <Td>{fmtGreek(row.put?.greeks?.delta ?? null, 2)}</Td>
                    <Td>{fmtCompact(row.put?.volume ?? 0)}</Td>
                    <Td>{fmtCompact(row.put?.oi ?? 0)}</Td>
                    <Td>{fmtIv(row.put?.iv)}</Td>
                    <Td>{fmtPrice(row.put?.last)}</Td>
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

function GreekCard({ title, side, row }: { title: string; side: "call" | "put"; row: StrikeRow }) {
  const quote = row[side];
  const greeks = quote?.greeks;
  return (
    <article className="rounded-lg border border-line px-3 py-3">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 font-mono text-sm tabular-nums text-muted">
        {quote?.bid != null || quote?.ask != null ? `Bid ${fmtPrice(quote?.bid)} / ask ${fmtPrice(quote?.ask)}` : "Combined view has no single bid or ask"}
        {quote?.iv != null ? ` · implied vol ${(quote.iv * 100).toFixed(1)}%` : ""}
      </p>
      {greeks ? (
        <dl className="mt-3 grid gap-1 text-sm">
          <GreekTerm term="Delta" value={fmtGreek(greeks.delta, 2)} meaning={deltaSentence(title, greeks.delta)} />
          <GreekTerm term="Gamma" value={fmtGreek(greeks.gamma, 4)} meaning={`If the share rises $1, delta changes by about ${fmtGreek(greeks.gamma, 3)}.`} />
          <GreekTerm term="Theta" value={fmtGreek(greeks.theta, 2)} meaning={`About ${money(greeks.theta)} of the price is set to disappear in one quiet day.`} />
          <GreekTerm term="Vega" value={fmtGreek(greeks.vega, 2)} meaning={`About ${money(greeks.vega)} if implied volatility rises 1 percentage point.`} />
          <GreekTerm term="Rho" value={fmtGreek(greeks.rho, 3)} meaning={`About ${money(greeks.rho)} if the model interest rate rises 1 percentage point.`} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted">No implied volatility on this contract, so the Greeks are blank. Open interest can still be read in the chain.</p>
      )}
    </article>
  );
}

function GreekTerm({ term, value, meaning }: { term: string; value: string; meaning: string }) {
  return (
    <div className="border-t border-line py-2">
      <div className="flex items-baseline justify-between gap-3">
        <dt>{term}</dt>
        <dd className="font-mono tabular-nums">{value}</dd>
      </div>
      <dd className="mt-1 text-muted">{meaning}</dd>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-lg border border-line bg-bg px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </article>
  );
}

function Td({ children }: { children: string }) {
  return <td className="px-2 py-2 font-mono tabular-nums">{children}</td>;
}

function nearestMark(rows: Array<{ strike: number }>, target: number): number | null {
  let best: number | null = null;
  let gap = Infinity;
  for (const row of rows) {
    const next = Math.abs(row.strike - target);
    if (next < gap) {
      gap = next;
      best = row.strike;
    }
  }
  return best;
}

function formatExpiry(ts: number): string {
  const days = Math.round(daysUntil(ts));
  const name = new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${name} · ${days}d`;
}

function fmtIv(iv: number | null | undefined): string {
  if (iv == null || !Number.isFinite(iv)) return "—";
  return `${(iv * 100).toFixed(1)}%`;
}

function fmtGreek(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function deltaSentence(title: string, delta: number): string {
  const cents = Math.abs(delta * 100).toFixed(0);
  if (title === "Call") return `About ${cents} cents higher if the share rises $1.`;
  return `About ${cents} cents lower if the share rises $1.`;
}
