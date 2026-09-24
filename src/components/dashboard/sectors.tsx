import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board } from "@/lib/market/types";
import { SECTORS, UNIVERSE, type SectorId } from "@/lib/market/universe";
import { fmtBp, fmtPct } from "@/lib/market/format";
import { Panel, Tone, tooltipStyle } from "@/components/dashboard/bits";

export function Sectors({ board }: { board: Board }) {
  const by = new Map(board.quotes.map((quote) => [quote.symbol, quote]));
  const rows = SECTORS.map((sector) => ({
    sector,
    m1: basket(sector.id, "m1", by),
    y1: basket(sector.id, "y1", by),
  }));
  const chart = rows.map((row) => ({ name: row.sector.label, m1: row.m1 }));
  const slope = board.t10y2y;
  const monthAgo = board.spreadPath.at(-2)?.curve ?? null;
  const oil = by.get("CL=F");
  const dollar = by.get("DX-Y.NYB");
  const steepening = slope != null && monthAgo != null ? slope - monthAgo : null;

  return (
    <div className="grid gap-4">
      <Panel title="What the curve is saying" kicker="Equal-weight of the names in each sleeve, last month.">
        <p className="max-w-2xl text-sm text-muted">
          {slope == null
            ? "The 10y–2y spread did not load."
            : slope >= 0
              ? `The curve is positive, 10y–2y at ${fmtBp(slope)}. Steepening tends to help bank margins and the cyclical sleeves. REITs and utilities still care about the level of the long bond, not just the slope.`
              : `The curve is inverted, 10y–2y at ${fmtBp(slope)}. That has been a recession warning and a headwind for net interest margin, with the old caveat that a hiking-cycle flatten can still be kind to deposit-funded banks.`}
          {steepening == null ? "" : ` Versus a month ago the spread has moved ${fmtBp(steepening)}.`}
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} interval={0} angle={-25} height={60} textAnchor="end" />
              <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={36} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="m1" name="1 month %">
                {chart.map((row) => (
                  <Cell key={row.name} fill={(row.m1 ?? 0) >= 0 ? "var(--color-up)" : "var(--color-down)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <article key={row.sector.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">{row.sector.label}</h3>
              <span className="text-sm text-muted">1m <Tone value={row.m1} /> · 1y <Tone value={row.y1} /></span>
            </div>
            <p className="mt-2 text-sm text-muted">{row.sector.note}</p>
          </article>
        ))}
      </div>
      <Panel title="The rest of the dashboard that this rotation listens to">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Item label="10y real" value={board.real10 == null ? "—" : `${board.real10.toFixed(2)}%`} />
          <Item label="HY OAS" value={board.hyOas == null ? "—" : `${(board.hyOas * 100).toFixed(0)} bp`} />
          <Item label="WTI, 1m" value={fmtPct(oil?.m1)} />
          <Item label="Dollar, 1m" value={fmtPct(dollar?.m1)} />
        </dl>
      </Panel>
    </div>
  );
}

function basket(sector: SectorId, key: "m1" | "y1", by: Map<string, Board["quotes"][number]>) {
  const values = UNIVERSE.filter((item) => item.sector === sector)
    .map((item) => by.get(item.symbol)?.[key])
    .filter((value): value is number => value != null);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
