import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board } from "@/lib/market/types";
import { SECTORS, UNIVERSE, type SectorId } from "@/lib/market/universe";
import { fmtBp, fmtPct } from "@/lib/market/format";
import { getRotation } from "@/lib/market/board.functions";
import { LOOKBACKS, ROTATION_SECTORS, lookbackOf, quadrant, relativeLine, trail, type LookbackId, type SectorBook, type TrailPoint } from "@/lib/market/rotation";
import { Panel, Tone, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

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
      <Rotation />
      <Panel title="What the yield curve is saying" kicker="Each stock in a group counts the same">
        <p className="max-w-2xl text-sm text-muted">
          Equal weight means a giant does not drown out a smaller name. A sleeve is the handful of stocks this desk uses for that industry, not every company in the sector. The last-month bars are percent changes.
          {slope == null
            ? " The 10-year minus 2-year spread did not load."
            : slope >= 0
              ? ` The curve is upward, 10-year minus 2-year at ${fmtBp(slope)}. A steeper curve usually helps bank profits, because they borrow short and lend long. Property stocks and utilities still care how high the long-term rate is, not only the slope.`
              : ` The curve is inverted, 10-year minus 2-year at ${fmtBp(slope)}. Short rates are above long rates. That has been a recession warning and a squeeze on bank margins. A hiking cycle can still be kind to banks that fund themselves with deposits.`}
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
      <Panel title="Other numbers this tab is listening to">
        <p className="mb-3 text-sm text-muted">Real yield is the 10-year after inflation. Junk extra yield is the premium for lending to shaky companies. WTI is US oil. The dollar is the dollar index.</p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Item label="10-year after inflation" value={board.real10 == null ? "—" : `${board.real10.toFixed(2)}%`} />
          <Item label="Junk extra yield" value={board.hyOas == null ? "—" : `${(board.hyOas * 100).toFixed(0)} bp`} />
          <Item label="WTI, 1m" value={fmtPct(oil?.m1)} />
          <Item label="Dollar, 1m" value={fmtPct(dollar?.m1)} />
        </dl>
      </Panel>
    </div>
  );
}

function Rotation() {
  const [look, setLook] = useState<LookbackId>("m3");
  const [focus, setFocus] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["sector-rotation"],
    queryFn: () => getRotation({ data: { fresh: false } }),
    staleTime: 30 * 60 * 1000,
  });
  const span = lookbackOf(look);
  const book = query.data;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {LOOKBACKS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLook(item.id)}
            className={cn("h-11 rounded-full border px-3 text-sm", look === item.id ? "border-fg bg-elevated text-fg" : "border-line text-muted")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {query.isPending ? <p className="text-sm text-muted">Reading sector prices against the S&P 500.</p> : null}
      {query.isError ? <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Sector history did not load."}</p> : null}
      {book ? (
        <>
          <Panel title="Relative strength versus the S&P 500" kicker={`${span.label} · zero means it matched the index`}>
            <p className="mb-3 text-sm text-muted">
              Each line is a sector fund divided by the S&P 500, restarted at zero at the beginning of this window. Above zero means that sector beat the index. Below zero means it lagged. These are the 11 S&P 500 sector funds, not the smaller sleeves in the cards below.
            </p>
            <StrengthChart book={book} days={span.days} focus={focus} onFocus={setFocus} />
          </Panel>
          <Panel title="Relative rotation" kicker={`${span.label} · arrow is the latest step`}>
            <p className="mb-3 text-sm text-muted">
              The horizontal axis is how the sector stands against the S&P 500 versus its own recent pace. Right of 100 means that relationship is stronger than usual. The vertical axis is whether that is speeding up. Above 100 means it is improving. The line chart above is the actual percent gained or lost against the index over this window. This chart is the direction. The tail is the path, and the arrow is the latest step. Leading is strong and still improving. Weakening is strong but fading. Lagging is weak and still fading. Improving is weak but starting to catch up. Not a signal to trade.
            </p>
            <RotationChart book={book} days={span.days} smooth={span.smooth} focus={focus} onFocus={setFocus} />
          </Panel>
        </>
      ) : null}
    </>
  );
}

function StrengthChart({ book, days, focus, onFocus }: { book: SectorBook; days: number; focus: string | null; onFocus: (symbol: string | null) => void }) {
  const lines = useMemo(
    () => book.sectors.map((sector) => ({
      ...sector,
      color: ROTATION_SECTORS.find((item) => item.symbol === sector.symbol)?.color ?? "var(--color-fg)",
      points: relativeLine(book.dates, sector.closes, book.benchmark, days),
    })),
    [book, days],
  );
  const data = lines[0]?.points.map((point, index) => {
    const row: Record<string, string | number | null> = { d: point.d };
    for (const line of lines) row[line.symbol] = line.points[index]?.v ?? null;
    return row;
  }) ?? [];
  return (
    <>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={32} tickFormatter={(value: string) => value.slice(5)} />
            <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={44} unit="%" />
            <Tooltip {...tooltipStyle} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, lines.find((line) => line.symbol === name)?.label ?? String(name)]} />
            <ReferenceLine y={0} stroke="var(--color-muted)" strokeDasharray="4 4" />
            {lines.map((line) => (
              <Line
                key={line.symbol}
                dataKey={line.symbol}
                name={line.symbol}
                stroke={line.color}
                dot={false}
                strokeWidth={focus && focus !== line.symbol ? 1 : 2}
                strokeOpacity={focus && focus !== line.symbol ? 0.2 : 1}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend book={book} trails={null} focus={focus} onFocus={onFocus} />
    </>
  );
}

function RotationChart({
  book,
  days,
  smooth,
  focus,
  onFocus,
}: {
  book: SectorBook;
  days: number;
  smooth: number;
  focus: string | null;
  onFocus: (symbol: string | null) => void;
}) {
  const trails = useMemo(
    () => book.sectors.map((sector) => ({
      ...sector,
      color: ROTATION_SECTORS.find((item) => item.symbol === sector.symbol)?.color ?? "var(--color-fg)",
      points: trail(book.dates, sector.closes, book.benchmark, days, smooth),
    })).filter((sector) => sector.points.length >= 2),
    [book, days, smooth],
  );
  return (
    <>
      <RrgPlot trails={trails} focus={focus} />
      <Legend book={book} trails={trails} focus={focus} onFocus={onFocus} />
    </>
  );
}

function Legend({
  book,
  trails,
  focus,
  onFocus,
}: {
  book: SectorBook;
  trails: { symbol: string; label: string; color: string; points: TrailPoint[] }[] | null;
  focus: string | null;
  onFocus: (symbol: string | null) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {book.sectors.map((sector) => {
        const color = ROTATION_SECTORS.find((item) => item.symbol === sector.symbol)?.color ?? "var(--color-fg)";
        const last = trails?.find((item) => item.symbol === sector.symbol)?.points.at(-1);
        const zone = last ? quadrant(last.ratio, last.momentum) : null;
        return (
          <button
            key={sector.symbol}
            type="button"
            onClick={() => onFocus(focus === sector.symbol ? null : sector.symbol)}
            className={cn("h-11 rounded-full border px-3 text-sm", focus === sector.symbol ? "border-fg bg-elevated" : "border-line")}
          >
            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: color }} />
            {sector.label}
            {zone ? <span className="ml-2 text-xs text-muted">{zone}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function RrgPlot({ trails, focus }: { trails: { symbol: string; label: string; color: string; points: TrailPoint[] }[]; focus: string | null }) {
  const width = 640;
  const height = 460;
  const pad = { l: 52, r: 18, t: 18, b: 42 };
  let minX = 98;
  let maxX = 102;
  let minY = 98;
  let maxY = 102;
  for (const trailRow of trails) {
    for (const point of trailRow.points) {
      minX = Math.min(minX, point.ratio);
      maxX = Math.max(maxX, point.ratio);
      minY = Math.min(minY, point.momentum);
      maxY = Math.max(maxY, point.momentum);
    }
  }
  const spanX = Math.max(2, maxX - minX);
  const spanY = Math.max(2, maxY - minY);
  minX -= spanX * 0.08;
  maxX += spanX * 0.08;
  minY -= spanY * 0.08;
  maxY += spanY * 0.08;
  const xOf = (value: number) => pad.l + ((value - minX) / (maxX - minX)) * (width - pad.l - pad.r);
  const yOf = (value: number) => pad.t + (1 - (value - minY) / (maxY - minY)) * (height - pad.t - pad.b);
  const x100 = xOf(100);
  const y100 = yOf(100);
  const zones = [
    { label: "Improving", x: pad.l + 8, y: pad.t + 16, anchor: "start" as const },
    { label: "Leading", x: width - pad.r - 8, y: pad.t + 16, anchor: "end" as const },
    { label: "Lagging", x: pad.l + 8, y: height - pad.b - 8, anchor: "start" as const },
    { label: "Weakening", x: width - pad.r - 8, y: height - pad.b - 8, anchor: "end" as const },
  ];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[28rem] w-full">
      <rect x={pad.l} y={pad.t} width={Math.max(0, x100 - pad.l)} height={Math.max(0, y100 - pad.t)} fill="var(--color-up)" opacity="0.08" />
      <rect x={x100} y={pad.t} width={Math.max(0, width - pad.r - x100)} height={Math.max(0, y100 - pad.t)} fill="var(--color-up)" opacity="0.16" />
      <rect x={pad.l} y={y100} width={Math.max(0, x100 - pad.l)} height={Math.max(0, height - pad.b - y100)} fill="var(--color-down)" opacity="0.12" />
      <rect x={x100} y={y100} width={Math.max(0, width - pad.r - x100)} height={Math.max(0, height - pad.b - y100)} fill="var(--color-warn)" opacity="0.12" />
      <line x1={x100} y1={pad.t} x2={x100} y2={height - pad.b} stroke="var(--color-muted)" strokeDasharray="4 4" />
      <line x1={pad.l} y1={y100} x2={width - pad.r} y2={y100} stroke="var(--color-muted)" strokeDasharray="4 4" />
      {zones.map((zone) => (
        <text key={zone.label} x={zone.x} y={zone.y} textAnchor={zone.anchor} fill="var(--color-subtle)" fontSize="12">
          {zone.label}
        </text>
      ))}
      <text x={width / 2} y={height - 8} textAnchor="middle" fill="var(--color-subtle)" fontSize="11">
        RS-ratio · right means stronger than its usual pace versus the index
      </text>
      <text x={14} y={height / 2} fill="var(--color-subtle)" fontSize="11" transform={`rotate(-90 14 ${height / 2})`}>
        RS-momentum · up means improvement is speeding up
      </text>
      {trails.map((sector) => {
        const dim = focus != null && focus !== sector.symbol;
        const path = sector.points.map((point) => `${xOf(point.ratio)},${yOf(point.momentum)}`).join(" ");
        const last = sector.points[sector.points.length - 1];
        const prev = sector.points[sector.points.length - 2];
        return (
          <g key={sector.symbol} opacity={dim ? 0.16 : 1}>
            <polyline points={path} fill="none" stroke={sector.color} strokeWidth={focus === sector.symbol ? 2.6 : 1.8} strokeLinejoin="round" strokeLinecap="round" />
            {prev && last ? <Arrow x1={xOf(prev.ratio)} y1={yOf(prev.momentum)} x2={xOf(last.ratio)} y2={yOf(last.momentum)} color={sector.color} /> : null}
            <circle cx={xOf(last.ratio)} cy={yOf(last.momentum)} r={focus === sector.symbol ? 4.5 : 3.2} fill={sector.color} />
            <text x={xOf(last.ratio) + 6} y={yOf(last.momentum) - 6} fill={sector.color} fontSize="11">
              {sector.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Arrow({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 9;
  const left = { x: x2 - size * Math.cos(angle - 0.45), y: y2 - size * Math.sin(angle - 0.45) };
  const right = { x: x2 - size * Math.cos(angle + 0.45), y: y2 - size * Math.sin(angle + 0.45) };
  return <polygon points={`${x2},${y2} ${left.x},${left.y} ${right.x},${right.y}`} fill={color} />;
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
