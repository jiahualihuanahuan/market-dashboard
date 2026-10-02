import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDark } from "@/lib/market/board.functions";
import { avgSize, darkShare, latestOf, priorOf, type DarkBook, type DarkRow } from "@/lib/market/dark";
import { fmtCompact, fmtPct } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";

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
  const week = book.weeks[book.weeks.length - 1] ?? "";
  const selected = book.rows.find((row) => row.symbol === symbol) ?? book.rows[0];
  const needle = query.trim().toUpperCase();
  const rows = useMemo(
    () => (needle ? book.rows.filter((row) => row.symbol.includes(needle) || row.name.toUpperCase().includes(needle)) : book.rows),
    [book.rows, needle],
  );
  const leaders = useMemo(
    () => rows.slice().sort((a, b) => latestOf(b) - latestOf(a)).slice(0, 15).map((row) => ({ symbol: row.symbol, dollars: latestOf(row) })),
    [rows],
  );
  const movers = useMemo(() => {
    return rows
      .map((row) => ({ symbol: row.symbol, change: changePct(row) }))
      .filter((row): row is { symbol: string; change: number } => row.change != null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 15)
      .sort((a, b) => b.change - a.change);
  }, [rows]);
  const split = useMemo(
    () => rows
      .filter((row) => row.otherNotional != null)
      .map((row) => ({ symbol: row.symbol, dark: latestOf(row), other: row.otherNotional ?? 0 }))
      .sort((a, b) => b.dark + b.other - (a.dark + a.other))
      .slice(0, 12),
    [rows],
  );
  const sizes = useMemo(
    () => rows
      .filter((row) => row.trades > 0)
      .map((row) => ({ symbol: row.symbol, size: Math.round(avgSize(row)) }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 12),
    [rows],
  );
  const series = selected
    ? book.weeks.map((item, index) => ({ week: shortDate(item), dollars: selected.notional[index] ?? 0 }))
    : [];
  const market = book.weeks.map((item, index) => ({
    week: shortDate(item),
    dollars: book.rows.reduce((sum, row) => sum + (row.notional[index] ?? 0), 0),
  }));
  const dailyDollars = (book.daily?.rows ?? [])
    .filter((row) => !needle || row.symbol.includes(needle))
    .slice()
    .sort((a, b) => (b.dollars ?? 0) - (a.dollars ?? 0))
    .slice(0, 15)
    .map((row) => ({ symbol: row.symbol, dollars: row.dollars ?? 0 }));
  const dailyShort = (book.daily?.rows ?? [])
    .filter((row) => row.shortPct != null && (!needle || row.symbol.includes(needle)))
    .slice()
    .sort((a, b) => (b.shortPct ?? 0) - (a.shortPct ?? 0))
    .slice(0, 15)
    .map((row) => ({ symbol: row.symbol, short: row.shortPct ?? 0 }));

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="min-w-0" title="Hidden trades, counted late" kicker={`Week starting ${longDate(week)} · published ${longDate(book.published)}`}>
        <p className="max-w-3xl text-sm text-muted">
          A dark pool is a private venue. The order is not posted on the public book. FINRA adds those prints up by ticker and releases them about two to three weeks later. Off-exchange is wider: it also includes a broker filling a customer from its own inventory. Click a bar to open that name. Dollars, not share count, so a cheap stock does not float to the top just by trading a lot of pieces.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by ticker or name"
          aria-label="Filter dark-pool charts"
          className="mt-3 h-11 w-full max-w-xs rounded-md border border-line bg-bg px-3 text-sm"
        />
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel className="min-w-0" title="Largest dark-pool dollars" kicker="This week · click a bar">
          <p className="mb-2 text-xs text-muted">Hidden venue dollars only. Not the public exchange, and not a broker filling from its own stock.</p>
          <HBars>
            <BarChart data={leaders} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "Dark-pool dollars"]} />
              <Bar dataKey="dollars" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)}>
                {leaders.map((row) => (
                  <Cell key={row.symbol} fill={row.symbol === selected?.symbol ? "var(--color-fg)" : "var(--color-muted)"} cursor="pointer" />
                ))}
              </Bar>
            </BarChart>
          </HBars>
        </Panel>

        <Panel className="min-w-0" title="Change from the prior week" kicker="Biggest swings, either way">
          <p className="mb-2 text-xs text-muted">How much dark-pool dollars rose or fell versus the week before. Green is more hidden dollars. Red is fewer.</p>
          <HBars>
            <BarChart data={movers} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} formatter={(value) => [fmtPct(typeof value === "number" ? value : null), "Versus prior week"]} />
              <Bar dataKey="change" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)}>
                {movers.map((row) => (
                  <Cell key={row.symbol} fill={row.change >= 0 ? "var(--color-up)" : "var(--color-down)"} cursor="pointer" />
                ))}
              </Bar>
            </BarChart>
          </HBars>
        </Panel>

        <Panel className="min-w-0" title="Dark pool versus the rest" kicker="Of all off-exchange dollars">
          <p className="mb-2 text-xs text-muted">The first color is the dark pool. The second is other off-exchange, mostly a broker filling from its own inventory. A long second bar means most of the hidden tape was not a dark pool.</p>
          <HBars>
            <BarChart data={split} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} formatter={(value, name) => [money(typeof value === "number" ? value : null), name === "dark" ? "Dark pool" : "Other off-exchange"]} />
              <Bar dataKey="dark" stackId="off" fill="var(--color-fg)" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)} />
              <Bar dataKey="other" stackId="off" fill="var(--color-line)" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)} />
            </BarChart>
          </HBars>
        </Panel>

        <Panel className="min-w-0" title="Average hidden print" kicker="Shares per dark-pool trade">
          <p className="mb-2 text-xs text-muted">Venues slice big orders into little pieces, so this is often under a hundred shares even in SPY. A taller bar is only a hint of larger orders.</p>
          <HBars>
            <BarChart data={sizes} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} formatter={(value) => [typeof value === "number" ? `${Math.round(value).toLocaleString("en-US")} shares` : "—", "Average print"]} />
              <Bar dataKey="size" fill="var(--color-muted)" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)} />
            </BarChart>
          </HBars>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel className="min-w-0" title={selected ? `${selected.symbol} over the last weeks` : "One name"} kicker={selected?.name ?? "Click a bar"}>
          {selected ? (
            <>
              <p className="mb-2 text-sm text-muted">{sentence(selected, week)}</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={56} />
                    <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "Dark-pool dollars"]} />
                    <Line type="monotone" dataKey="dollars" stroke="var(--color-fg)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No names came back.</p>
          )}
        </Panel>
        <Panel className="min-w-0" title="All large names together" kicker="Dark-pool dollars each week">
          <p className="mb-2 text-xs text-muted">The same set of large US names, added up. This is the weekly file, so the latest bar is already a couple of weeks old.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={market} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                <YAxis tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={56} />
                <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "Dark-pool dollars"]} />
                <Bar dataKey="dollars" fill="var(--color-muted)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel className="min-w-0" title="Newer off-exchange dollars" kicker={book.daily ? `A day or two old · ${longDate(book.daily.asOf)}` : "Daily file missing"}>
          {book.daily ? (
            <>
              <p className="mb-2 text-xs text-muted">
                Fresher than the weekly file, but it does not split dark pools from brokers. The whole tape that day was {fmtCompact(book.daily.offShares)} shares.
              </p>
              <HBars>
                <BarChart data={dailyDollars} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => fmtCompact(Number(value))} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                  <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [money(typeof value === "number" ? value : null), "Off-exchange dollars"]} />
                  <Bar dataKey="dollars" fill="var(--color-muted)" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)} />
                </BarChart>
              </HBars>
            </>
          ) : (
            <p className="text-sm text-muted">The daily off-exchange file did not load. The weekly charts above are still the dark-pool file.</p>
          )}
        </Panel>
        <Panel className="min-w-0" title="Share marked short" kicker="Same newer tape, not a dark pool">
          {book.daily ? (
            <>
              <p className="mb-2 text-xs text-muted">
                The percent of those off-exchange shares marked as a short sale.{book.daily.shortPct == null ? "" : ` The whole tape was ${book.daily.shortPct.toFixed(0)}%.`} A high number is a label on the trade, not a forecast.
              </p>
              <HBars>
                <BarChart data={dailyShort} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                  <YAxis type="category" dataKey="symbol" width={52} tick={{ fill: "var(--color-fg)", fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [typeof value === "number" ? `${value.toFixed(0)}%` : "—", "Marked short"]} />
                  <Bar dataKey="short" fill="var(--color-down)" isAnimationActive={false} onClick={(state) => pick(state, setSymbol)} />
                </BarChart>
              </HBars>
            </>
          ) : (
            <p className="text-sm text-muted">No daily tape, so there is no short-share chart.</p>
          )}
        </Panel>
      </div>
      <p className="text-xs text-muted">{book.note}</p>
    </div>
  );
}

function HBars({ children }: { children: ReactElement }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

function pick(state: unknown, setSymbol: (symbol: string) => void) {
  const symbol = (state as { symbol?: string } | null)?.symbol;
  if (symbol) setSymbol(symbol);
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
    ? "FINRA did not publish the matching non-dark-pool file for this name."
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
