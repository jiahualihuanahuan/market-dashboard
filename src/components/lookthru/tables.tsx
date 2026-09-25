import { X } from "lucide-react";
import { Badge } from "@/components/lookthru/ui/badge";
import { Button } from "@/components/lookthru/ui/button";
import { Input } from "@/components/lookthru/ui/input";
import { formatChange, formatMoney, formatPct } from "@/lib/lookthru/format";
import type { LookthroughResult, PositionView } from "@/lib/lookthru/types";
import { cn } from "@/lib/utils";

function KindBadge({ kind }: { kind: string }) {
  if (kind === "etf") return <Badge variant="accent">ETF</Badge>;
  if (kind === "cash") return <Badge>Cash</Badge>;
  if (kind === "other") return <Badge>Other</Badge>;
  return <Badge variant="outline">Stock</Badge>;
}

export function PositionsTable({
  result,
  onShares,
  onRemove,
}: {
  result: LookthroughResult;
  onShares: (id: string, shares: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-surface border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[11px] tracking-wide whitespace-nowrap text-muted uppercase">
          <tr className="border-b border-line">
            <th className="px-4 py-3 font-medium">Holding</th>
            <th className="px-4 py-3 font-medium">Kind</th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="px-4 py-3 text-right font-medium">Weight</th>
            <th className="w-12 px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {result.positions.map((p) => (
            <PositionRow
              key={p.id}
              row={p}
              currency={result.currency}
              onShares={onShares}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositionRow({
  row,
  currency,
  onShares,
  onRemove,
}: {
  row: PositionView;
  currency: LookthroughResult["currency"];
  onShares: (id: string, shares: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <tr className="border-b border-line/70 last:border-0">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-mono text-sm">{row.ticker}</span>
          <span className="max-w-[240px] truncate text-xs text-muted">{row.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <KindBadge kind={row.kind} />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min={0.0001}
          step="any"
          defaultValue={row.shares}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0 && n !== row.shares) onShares(row.id, n);
          }}
          className="ml-auto h-9 w-24 text-right font-mono tabular-nums"
        />
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">
        <div>
          {row.price == null ? "—" : formatMoney(row.price, row.currency, true)}
          {row.currency && row.currency !== currency ? (
            <span className="ml-1 text-[11px] text-subtle">{row.currency}</span>
          ) : null}
        </div>
        <div
          className={cn(
            "text-xs",
            (row.changePct ?? 0) > 0 && "text-up",
            (row.changePct ?? 0) < 0 && "text-down",
          )}
        >
          {formatChange(row.changePct)}
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">
        {formatMoney(row.value, currency)}
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatPct(row.weight)}</td>
      <td className="px-2 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => onRemove(row.id)}
          aria-label={`Remove ${row.ticker}`}
        >
          <X className="size-4" />
        </Button>
      </td>
    </tr>
  );
}

export function LookthroughTable({ result }: { result: LookthroughResult }) {
  const stocks = result.leaves.filter((l) => l.kind === "equity" || l.kind === "etf");
  const other = result.leaves.filter((l) => l.kind === "cash" || l.kind === "other");
  const all = [...stocks, ...other];
  const rows = all.slice(0, 60);
  const hidden = all.length - rows.length;

  return (
    <div className="overflow-x-auto rounded-xl bg-surface border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[11px] tracking-wide whitespace-nowrap text-muted uppercase">
          <tr className="border-b border-line">
            <th className="px-4 py-3 font-medium">Underlying</th>
            <th className="px-4 py-3 font-medium">Sector</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="px-4 py-3 font-medium">Of portfolio</th>
            <th className="px-4 py-3 font-medium">Via</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((leaf) => (
            <tr key={leaf.symbol} className="border-b border-line/70 last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{leaf.displaySymbol}</span>
                  <KindBadge kind={leaf.kind} />
                </div>
                <p className="max-w-[280px] truncate text-xs text-muted">{leaf.name}</p>
              </td>
              <td className="px-4 py-3 text-xs text-muted">{leaf.sector}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {formatMoney(leaf.value, result.currency)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, Math.abs(leaf.weight) * 100 * 4)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums">{formatPct(leaf.weight)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {leaf.sources
                  .slice(0, 3)
                  .map((s) => s.from)
                  .join(", ")}
                {leaf.sources.length > 3 ? ` +${leaf.sources.length - 3}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          {hidden} smaller names folded into the nested tree.
        </p>
      ) : null}
    </div>
  );
}
