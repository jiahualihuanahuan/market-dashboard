import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHeatmap } from "@/lib/market/board.functions";
import { fmtPct } from "@/lib/market/format";
import { treemap } from "@/lib/market/treemap";
import type { HeatCell } from "@/lib/market/types";
import { Panel } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const INDEXES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^NDX", label: "Nasdaq-100" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^GDAXI", label: "DAX" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "^AXJO", label: "ASX 200" },
  { symbol: "^GSPTSE", label: "S&P/TSX" },
];

const WINDOWS = [
  { id: "d1", label: "1 day", scale: 3 },
  { id: "w1", label: "1 week", scale: 6 },
  { id: "m1", label: "1 month", scale: 12 },
  { id: "y1", label: "1 year", scale: 40 },
] as const;

type WindowId = (typeof WINDOWS)[number]["id"];
type StockRect = { symbol: string; x: number; y: number; w: number; h: number };
type SectorRect = { sector: string; x: number; y: number; w: number; h: number };

export function HeatmapTab() {
  const [index, setIndex] = useState("^GSPC");
  const [horizon, setHorizon] = useState<WindowId>("d1");
  const [zoom, setZoom] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [width, setWidth] = useState(960);
  const boxRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["heatmap", "v2", index],
    queryFn: () => getHeatmap({ data: { index, live: liveRef.current } }),
    staleTime: 8 * 60 * 1000,
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

  useEffect(() => {
    setZoom(null);
    setPicked(null);
    setHover(null);
  }, [index]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth)));
    observer.observe(el);
    setWidth(Math.max(320, el.clientWidth));
    return () => observer.disconnect();
  }, [query.data]);

  const scale = WINDOWS.find((item) => item.id === horizon)?.scale ?? 3;
  const cells = query.data?.cells ?? [];
  const bySymbol = useMemo(() => new Map(cells.map((cell) => [cell.symbol, cell])), [cells]);
  const height = Math.max(520, Math.min(760, Math.round(width * 0.62)));
  const layout = useMemo(
    () => buildLayout(cells, zoom, width, height),
    [cells, zoom, width, height],
  );
  const active = bySymbol.get(picked ?? hover ?? "") ?? null;
  const pricedCaps = cells.filter((cell) => cell.cap > 0).length;
  const sectors = useMemo(() => sectorRollup(cells, horizon), [cells, horizon]);

  return (
    <div className="grid gap-4">
      <Panel
        title={query.data?.label ?? "Index members"}
        kicker="Grouped by sector. Bigger tile, bigger company."
        action={
          <div className="flex gap-2 overflow-x-auto">
            {WINDOWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setHorizon(item.id)}
                className={cn(
                  "h-11 shrink-0 rounded-full border px-3 text-sm",
                  horizon === item.id ? "border-fg text-fg" : "border-line text-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {INDEXES.map((item) => (
            <button
              key={item.symbol}
              type="button"
              onClick={() => setIndex(item.symbol)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-3 text-sm",
                index === item.symbol ? "border-fg bg-elevated text-fg" : "border-line text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm text-muted">
          Each block is a sector: companies in the same line of business, such as banks or energy. Inside a block, tile area is market value, the share price times the number of shares. A company worth twice as much gets twice the space. Green is up, red is down, and a darker tile is a bigger move. Hover or click a tile for the name. Click a sector to open only that group.
          {query.data ? ` ${query.data.cells.length} of ${query.data.listed} names came back with a price.` : ""}
          {cells.length && pricedCaps < cells.length
            ? ` ${cells.length - pricedCaps} ${cells.length - pricedCaps === 1 ? "name has" : "names have"} no market value yet, so those tiles are drawn small instead of at a real size.`
            : ""}
        </p>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setZoom(null)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-3 text-sm",
              zoom == null ? "border-fg text-fg" : "border-line text-muted",
            )}
          >
            All sectors
          </button>
          {sectors.map((item) => (
            <button
              key={item.sector}
              type="button"
              onClick={() => setZoom(item.sector)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-3 text-sm",
                zoom === item.sector ? "border-fg text-fg" : "border-line text-muted",
              )}
            >
              {item.sector}
              <span className="ml-2 font-mono text-xs tabular-nums">{item.change == null ? "" : fmtPct(item.change)}</span>
            </button>
          ))}
        </div>
        {query.isPending ? <p className="text-sm text-muted">Reading every member, then sorting them by sector and company size.</p> : null}
        {query.isError ? (
          <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "The index list did not load."}</p>
        ) : null}
        <div ref={boxRef} className="relative">
          {cells.length ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-auto w-full touch-manipulation"
              role="img"
              aria-label="Stock heatmap sized by market value"
              onMouseLeave={() => setHover(null)}
              onMouseMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - box.left) / box.width) * width;
                const y = ((event.clientY - box.top) / box.height) * height;
                const hit = hitTest(layout.stocks, x, y);
                setHover(hit);
              }}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - box.left) / box.width) * width;
                const y = ((event.clientY - box.top) / box.height) * height;
                setPicked(hitTest(layout.stocks, x, y));
              }}
            >
              {layout.sectors.map((sector) => (
                <g key={sector.sector}>
                  <rect x={sector.x} y={sector.y} width={sector.w} height={sector.h} fill="var(--color-bg)" />
                  {sector.h > 16 && sector.w > 48 ? (
                    <text x={sector.x + 4} y={sector.y + 13} fill="var(--color-muted)" fontSize="11">
                      {sector.sector}
                    </text>
                  ) : null}
                </g>
              ))}
              {layout.stocks.map((tile) => {
                const cell = bySymbol.get(tile.symbol);
                const value = cell?.[horizon] ?? null;
                const on = tile.symbol === picked || tile.symbol === hover;
                return (
                  <g key={tile.symbol}>
                    <rect
                      x={tile.x}
                      y={tile.y}
                      width={Math.max(tile.w, 0)}
                      height={Math.max(tile.h, 0)}
                      rx={2}
                      fill={fillFor(value, scale)}
                      stroke={on ? "var(--color-fg)" : "transparent"}
                      strokeWidth={on ? 1.5 : 0}
                    />
                    {tile.w > 42 && tile.h > 26 ? (
                      <text x={tile.x + tile.w / 2} y={tile.y + tile.h / 2 - (tile.h > 40 ? 4 : 0)} textAnchor="middle" fill="var(--color-fg)" fontSize="11" fontFamily="ui-monospace, monospace">
                        {tile.symbol}
                      </text>
                    ) : null}
                    {tile.w > 42 && tile.h > 40 ? (
                      <text x={tile.x + tile.w / 2} y={tile.y + tile.h / 2 + 12} textAnchor="middle" fill="var(--color-fg)" fontSize="10" fontFamily="ui-monospace, monospace">
                        {value == null ? "" : fmtPct(value)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
        {active ? <StockCard cell={active} horizon={horizon} /> : null}
      </Panel>
    </div>
  );
}

function StockCard({ cell, horizon }: { cell: HeatCell; horizon: WindowId }) {
  const value = cell[horizon];
  return (
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <p className="font-medium">{cell.name}</p>
        <p className="text-sm text-muted">
          {cell.symbol} · {cell.sector}
          {cell.industry && cell.industry.toLowerCase() !== cell.sector.toLowerCase() ? ` · ${cell.industry}` : ""}
        </p>
      </div>
      <div className="flex gap-4 font-mono text-sm tabular-nums">
        <span>{cell.cap > 0 ? fmtCap(cell.cap, cell.currency) : "Size unknown"}</span>
        <span className={value != null && value < 0 ? "text-down" : "text-up"}>{value == null ? "—" : fmtPct(value)}</span>
      </div>
    </div>
  );
}

function sectorRollup(cells: HeatCell[], horizon: WindowId) {
  const groups = new Map<string, { cap: number; weighted: number }>();
  for (const cell of cells) {
    const cap = cell.cap > 0 ? cell.cap : 0;
    const group = groups.get(cell.sector) ?? { cap: 0, weighted: 0 };
    group.cap += cap;
    const change = cell[horizon];
    if (cap > 0 && change != null) group.weighted += cap * change;
    groups.set(cell.sector, group);
  }
  return [...groups.entries()]
    .map(([sector, group]) => ({
      sector,
      cap: group.cap,
      change: group.cap > 0 ? Math.round((group.weighted / group.cap) * 100) / 100 : null,
    }))
    .sort((a, b) => b.cap - a.cap);
}

function buildLayout(cells: HeatCell[], zoom: string | null, width: number, height: number) {
  const visible = zoom ? cells.filter((cell) => cell.sector === zoom) : cells;
  const caps = visible.map((cell) => cell.cap).filter((cap) => cap > 0).sort((a, b) => a - b);
  const floor = caps[Math.floor(caps.length * 0.08)] || caps[0] || 1;
  const valueOf = (cell: HeatCell) => (cell.cap > 0 ? cell.cap : floor);
  if (zoom) {
    const stocks = treemap(
      visible.map((cell) => ({ symbol: cell.symbol, value: valueOf(cell) })),
      { x: 2, y: 2, w: width - 4, h: height - 4 },
    ).map(shrink);
    return { sectors: [] as SectorRect[], stocks };
  }
  const groups = new Map<string, HeatCell[]>();
  for (const cell of visible) {
    const list = groups.get(cell.sector) ?? [];
    list.push(cell);
    groups.set(cell.sector, list);
  }
  const sectorNodes = [...groups.entries()].map(([sector, rows]) => ({
    sector,
    value: rows.reduce((sum, cell) => sum + valueOf(cell), 0),
    rows,
  }));
  const placed = treemap(sectorNodes, { x: 0, y: 0, w: width, h: height });
  const sectors: SectorRect[] = [];
  const stocks: StockRect[] = [];
  for (const sector of placed) {
    const inner = { x: sector.x + 3, y: sector.y + 18, w: sector.w - 6, h: sector.h - 22 };
    sectors.push({ sector: sector.sector, x: sector.x, y: sector.y, w: sector.w, h: sector.h });
    if (inner.w < 8 || inner.h < 8) continue;
    stocks.push(
      ...treemap(
        sector.rows.map((cell) => ({ symbol: cell.symbol, value: valueOf(cell) })),
        inner,
      ).map(shrink),
    );
  }
  return { sectors, stocks };
}

function shrink(tile: StockRect): StockRect {
  return { symbol: tile.symbol, x: tile.x + 1, y: tile.y + 1, w: Math.max(tile.w - 2, 0), h: Math.max(tile.h - 2, 0) };
}

function hitTest(tiles: StockRect[], x: number, y: number): string | null {
  for (let i = tiles.length - 1; i >= 0; i -= 1) {
    const tile = tiles[i];
    if (x >= tile.x && x <= tile.x + tile.w && y >= tile.y && y <= tile.y + tile.h) return tile.symbol;
  }
  return null;
}

function fillFor(value: number | null, scale: number): string {
  if (value == null || Math.abs(value) < 0.05) return "var(--color-elevated)";
  const mix = Math.round(Math.min(Math.abs(value) / scale, 1) * 78);
  const ink = value > 0 ? "var(--color-up)" : "var(--color-down)";
  return `color-mix(in oklab, ${ink} ${mix}%, var(--color-surface))`;
}

function fmtCap(value: number, currency: string): string {
  const abs = Math.abs(value);
  const digits = abs >= 1e12 ? 2 : 1;
  const body = abs >= 1e12 ? `${(value / 1e12).toFixed(digits)}T` : abs >= 1e9 ? `${(value / 1e9).toFixed(digits)}B` : `${(value / 1e6).toFixed(0)}M`;
  const mark = currency === "USD" || currency === "" ? "$" : currency === "EUR" ? "€" : currency === "GBP" || currency === "GBp" ? "£" : currency === "JPY" ? "¥" : currency === "CAD" ? "C$" : currency === "AUD" ? "A$" : currency === "CHF" ? "CHF " : `${currency} `;
  return `${mark}${body}`;
}
