import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDark } from "@/lib/market/board.functions";
import { avgSize, darkShare, latestOf, priorOf, type DarkBook, type DarkRow } from "@/lib/market/dark";
import { fmtCompact, fmtPct } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const GLOSSARY: [string, string][] = [
  ["Dark pool", "A private venue, an ATS, where the order is not shown on the public exchange book. Other people cannot see it sitting there. The trade still prints afterward."],
  ["ATS", "Alternative trading system. This is the regulatory name for a dark pool. The weekly dollars in the main table are ATS prints only."],
  ["Off-exchange", "Any trade that did not happen on an exchange. That includes dark pools and brokers filling a customer's order from their own stock."],
  ["Wholesaler", "A broker that pays to take a customer's order and fills it internally. That volume is off-exchange, but it is not a dark pool. It sits in the other-off-exchange column."],
  ["ATS share", "Dark-pool dollars divided by all off-exchange dollars. A high share means the hidden tape was mostly a dark pool. A low share means most of it was not."],
  ["Average print", "ATS shares divided by the number of ATS trades. Modern dark pools slice orders, so this is often under a hundred shares even in SPY. Bigger is only a hint of larger orders."],
  ["Tier 1", "FINRA's list of large names: S&P 500, Russell 1000, and selected ETFs. Smaller stocks are a different file and are not in this table."],
  ["Short share", "On the daily tape only: off-exchange shares marked as a short sale. It is not dark-pool volume, and a high number is not by itself a reason to buy or sell."],
];

export function DarkTab() {
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["dark-pool"],
    queryFn: () => getDark({ data: { live: liveRef.current } }),
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

  if (query.isPending) return <p className="text-sm text-muted">Reading FINRA's weekly dark-pool file.</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Dark-pool data did not load."}</p>;
  }
  return <DarkDesk book={query.data} />;
}

function DarkDesk({ book }: { book: DarkBook }) {
  const [symbol, setSymbol] = useState("SPY");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"dollars" | "share" | "size" | "change">("dollars");
  const week = book.weeks[book.weeks.length - 1] ?? "";
  const prior = book.weeks.length >= 2 ? book.weeks[book.weeks.length - 2] : "";
  const selected = book.rows.find((row) => row.symbol === symbol) ?? book.rows[0];
  const stats = useMemo(() => summarize(book.rows), [book.rows]);
  const ranked = useMemo(() => rankRows(book.rows, query, sort), [book.rows, query, sort]);
  const shown = ranked.slice(0, query.trim() ? 40 : 25);
  const leaders = book.rows.slice(0, 12).map((row) => ({ symbol: row.symbol, dollars: latestOf(row) }));
  const series = selected
    ? book.weeks.map((item, index) => ({ week: shortDate(item), dollars: selected.notional[index] ?? 0 }))
    : [];
  const market = book.weeks.map((item, index) => ({
    week: shortDate(item),
    dollars: book.rows.reduce((sum, row) => sum + (row.notional[index] ?? 0), 0),
  }));

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="min-w-0" title="Hidden trades, counted late" kicker={`Week starting ${longDate(week)} · published ${longDate(book.published)}`}>
        <p className="max-w-3xl text-sm text-muted">
          A dark pool is a private venue. The order is not posted on the public book, so nobody can see it waiting. FINRA adds up those prints by ticker and releases them about two to three weeks later. This page is that file for large US names. It is not a live tape, and it is not a forecast.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Off-exchange is wider than a dark pool. It also includes brokers who fill a customer's order from their own inventory. The ATS share column splits those two. Average print size is usually small now, because venues slice big orders into little pieces. SPY's typical ATS print in this file is about {stats.spySize ? `${Math.round(stats.spySize)} shares` : "under 100 shares"}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Tier 1 dark-pool dollars" value={money(stats.total)} detail={`Week of ${shortDate(week)}`} />
          <Stat label="Versus the prior week" value={fmtPct(stats.change)} detail={prior ? `Prior week ${shortDate(prior)}` : "No prior week"} />
          <Stat label="Top 10 share of those dollars" value={stats.top10 == null ? "—" : `${stats.top10.toFixed(0)}%`} detail="How concentrated the hidden tape is" />
          <Stat label="Typical ATS share" value={stats.medianShare == null ? "—" : `${stats.medianShare.toFixed(0)}%`} detail="Median dark-pool share of off-exchange dollars" />
        </div>
      </Panel>

      {book.flags.length ? (
        <Panel className="min-w-0" title="What stands out" kicker="Descriptions, not instructions">
          <ul className="grid gap-2 lg:grid-cols-2">
            {book.flags.map((flag) => (
              <li key={`${flag.symbol}-${flag.label}`}>
                <button
                  type="button"
                  onClick={() => setSymbol(flag.symbol)}
                  className="flex min-h-11 w-full flex-col items-start rounded-md border border-line px-3 py-2 text-left hover:bg-elevated"
                >
                  <span className="font-mono text-sm">{flag.symbol} <span className="text-muted">{flag.label}</span></span>
                  <span className="text-sm text-muted">{flag.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel className="min-w-0" title="Largest dark-pool dollars" kicker="Top 12 names this week">
          <p className="mb-2 text-xs text-muted">Dollars, not shares. A cheap stock can print a huge share count and still be a small trade.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leaders} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
                <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "ATS dollars"]} />
                <Bar dataKey="dollars" fill="var(--color-muted)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="min-w-0" title={selected ? `${selected.symbol} dark-pool dollars` : "One name"} kicker={selected?.name ?? "Pick a row"}>
          {selected ? (
            <>
              <p className="mb-2 text-sm text-muted">{sentence(selected, week)}</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={56} />
                    <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "ATS dollars"]} />
                    <Line type="monotone" dataKey="dollars" stroke="var(--color-fg)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No names came back.</p>
          )}
        </Panel>
      </div>

      <Panel className="min-w-0" title="Tier 1 dark-pool dollars" kicker="Same set of large names, each week">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={market} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="week" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={56} />
              <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "ATS dollars"]} />
              <Bar dataKey="dollars" fill="var(--color-muted)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        className="min-w-0"
        title="Top tickers"
        kicker={`${book.rows.length.toLocaleString("en-US")} names · showing ${shown.length}`}
        action={
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ticker or name"
            aria-label="Search dark-pool names"
            className="h-11 w-40 rounded-md border border-line bg-bg px-3 text-sm"
          />
        }
      >
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">Ticker</th>
                <SortHead label="ATS dollars" on={sort === "dollars"} onClick={() => setSort("dollars")} />
                <th className="px-2 py-2 font-medium">Shares</th>
                <SortHead label="Avg print" on={sort === "size"} onClick={() => setSort("size")} />
                <SortHead label="ATS share" on={sort === "share"} onClick={() => setSort("share")} />
                <SortHead label="Vs prior week" on={sort === "change"} onClick={() => setSort("change")} />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const share = darkShare(row);
                const change = changePct(row);
                return (
                  <tr
                    key={row.symbol}
                    onClick={() => setSymbol(row.symbol)}
                    className={cn("cursor-pointer border-t border-line", row.symbol === selected?.symbol ? "bg-elevated" : "hover:bg-surface")}
                  >
                    <td className="px-2 py-3">
                      <span className="font-mono">{row.symbol}</span>
                      <span className="mt-0.5 block max-w-56 truncate text-xs text-muted">{row.name}</span>
                    </td>
                    <td className="px-2 py-3 font-mono tabular-nums">{money(latestOf(row))}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{fmtCompact(row.shares[row.shares.length - 1] ?? 0)}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{row.trades > 0 ? Math.round(avgSize(row)).toLocaleString("en-US") : "—"}</td>
                    <td className="px-2 py-3 font-mono tabular-nums">{share == null ? "—" : `${share.toFixed(0)}%`}</td>
                    <td className={cn("px-2 py-3 font-mono tabular-nums", change == null ? "text-muted" : change >= 0 ? "text-up" : "text-down")}>{fmtPct(change)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-xs text-muted">{book.note}</p>
      </Panel>

      <Panel className="min-w-0" title="Newer off-exchange tape" kicker={book.daily ? `FINRA TRF · ${longDate(book.daily.asOf)}` : "Daily file missing"}>
        {book.daily ? (
          <>
            <p className="max-w-3xl text-sm text-muted">
              This file is only a day or two old, but it does not split dark pools from wholesalers. It is every share reported to FINRA's off-exchange tape. Dollars are those shares times the latest close, so a low-priced stock does not rise to the top just by trading a lot of pieces. The whole tape that day was {fmtCompact(book.daily.offShares)} shares{book.daily.shortPct == null ? "" : `, and ${book.daily.shortPct.toFixed(0)}% of them were marked short`}. A high short share is a label on the trade, not a dark pool and not a forecast.
            </p>
            <div className="mt-3 max-w-full overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Ticker</th>
                    <th className="px-2 py-2 font-medium">Off-exchange $</th>
                    <th className="px-2 py-2 font-medium">Shares</th>
                    <th className="px-2 py-2 font-medium">Short share</th>
                  </tr>
                </thead>
                <tbody>
                  {book.daily.rows.map((row) => (
                    <tr key={row.symbol} className="border-t border-line">
                      <td className="px-2 py-3 font-mono">{row.symbol}</td>
                      <td className="px-2 py-3 font-mono tabular-nums">{money(row.dollars)}</td>
                      <td className="px-2 py-3 font-mono tabular-nums">{fmtCompact(row.offShares)}</td>
                      <td className="px-2 py-3 font-mono tabular-nums">{row.shortPct == null ? "—" : `${row.shortPct.toFixed(0)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">The daily off-exchange file did not load. The weekly dark-pool table above is still the ATS file.</p>
        )}
      </Panel>

      <Panel className="min-w-0" title="What the words mean" kicker="Plain English">
        <dl className="grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term} className="rounded-lg border border-line px-3 py-2">
              <dt className="text-sm font-medium">{term}</dt>
              <dd className="mt-1 text-sm text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

function SortHead({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <th className="px-2 py-2 font-medium">
      <button type="button" onClick={onClick} className={cn("min-h-11 text-left", on ? "text-fg" : "text-muted")}>
        {label}
      </button>
    </th>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums">{value}</p>
      <p className="text-xs text-muted">{detail}</p>
    </div>
  );
}

function summarize(rows: DarkRow[]) {
  const total = rows.reduce((sum, row) => sum + latestOf(row), 0);
  const prev = rows.reduce((sum, row) => sum + priorOf(row), 0);
  const top10 = total > 0 ? (rows.slice(0, 10).reduce((sum, row) => sum + latestOf(row), 0) / total) * 100 : null;
  const shares = rows.map((row) => darkShare(row)).filter((value): value is number => value != null).sort((a, b) => a - b);
  const spy = rows.find((row) => row.symbol === "SPY");
  return {
    total,
    change: prev > 0 ? ((total - prev) / prev) * 100 : null,
    top10,
    medianShare: shares.length ? shares[Math.floor(shares.length / 2)] : null,
    spySize: spy && spy.trades > 0 ? avgSize(spy) : null,
  };
}

function rankRows(rows: DarkRow[], query: string, sort: "dollars" | "share" | "size" | "change"): DarkRow[] {
  const needle = query.trim().toUpperCase();
  const filtered = needle
    ? rows.filter((row) => row.symbol.includes(needle) || row.name.toUpperCase().includes(needle))
    : rows;
  const copy = [...filtered];
  if (sort === "share") copy.sort((a, b) => (darkShare(b) ?? -1) - (darkShare(a) ?? -1));
  else if (sort === "size") copy.sort((a, b) => avgSize(b) - avgSize(a));
  else if (sort === "change") copy.sort((a, b) => (changePct(b) ?? -1e9) - (changePct(a) ?? -1e9));
  else copy.sort((a, b) => latestOf(b) - latestOf(a));
  return copy;
}

function changePct(row: DarkRow): number | null {
  const prior = priorOf(row);
  if (!(prior > 0)) return null;
  return ((latestOf(row) - prior) / prior) * 100;
}

function sentence(row: DarkRow, week: string): string {
  const share = darkShare(row);
  const size = row.trades > 0 ? Math.round(avgSize(row)).toLocaleString("en-US") : null;
  const change = changePct(row);
  const shareText = share == null
    ? "FINRA did not publish the matching non-ATS file for this name."
    : `${share.toFixed(0)}% of its off-exchange dollars were on a dark pool, and the rest were not.`;
  const changeText = change == null ? "" : ` That is ${fmtPct(change)} versus the prior week.`;
  return `${row.symbol} had ${money(latestOf(row))} of dark-pool prints in the week of ${shortDate(week)}.${changeText} ${shareText}${size ? ` The average hidden print was ${size} shares.` : ""}`;
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${fmtCompact(value)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function shortDate(iso: string): string {
  const parsed = parts(iso);
  if (!parsed) return iso;
  return `${MONTHS[parsed[1] - 1]} ${parsed[2]}`;
}

function longDate(iso: string): string {
  const parsed = parts(iso);
  if (!parsed) return iso;
  return `${MONTHS[parsed[1] - 1]} ${parsed[2]}, ${parsed[0]}`;
}
