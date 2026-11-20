import type { Board } from "@/lib/market/types";
import { UNIVERSE_BY_SYMBOL } from "@/lib/market/universe";
import { zoneRank } from "@/lib/market/rules";
import { fmtPrice } from "@/lib/market/format";
import { useDesk } from "@/lib/market/settings";
import { Panel, Tone } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

export function Radar({ board, ready }: { board: Board; ready: boolean }) {
  const zones = useDesk((state) => state.zones);
  const watch = useDesk((state) => state.watch);
  const by = new Map(board.quotes.map((quote) => [quote.symbol, quote]));
  const ranked = zones
    .map((zone) => {
      const quote = by.get(zone.symbol);
      if (!quote) return null;
      const rank = zoneRank(quote.price, zone, quote.high52, quote.low52);
      return { zone, quote, ...rank };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => b.score - a.score);
  const extras = watch.filter((symbol) => !zones.some((zone) => zone.symbol === symbol));

  return (
    <div className="grid gap-4">
      <Panel title="Where idle cash would go" kicker="Safety cash stays in Treasuries and is not on this list.">
        <p className="mb-3 text-sm text-muted">
          A zone is the price band where you would actually buy. Below it is cheaper than you planned. Above the skip line, you walk away. The score only sorts the list for a weekly look. Idle cash is money you could invest and have not. Two years of living expenses in government bonds is not idle cash.
        </p>
        {!ready ? <p className="text-sm text-muted">Reading your zones…</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Close</th>
                <th className="px-2 py-2 font-medium">Zone</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">1m</th>
                <th className="px-2 py-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => (
                <tr key={row.zone.symbol} className="border-t border-line">
                  <td className="py-3 pr-3">
                    <span className="block font-medium">{UNIVERSE_BY_SYMBOL.get(row.zone.symbol)?.label ?? row.zone.symbol}</span>
                    <span className="text-xs text-muted">{row.zone.note}</span>
                  </td>
                  <td className="px-2 py-3 font-mono tabular-nums">{fmtPrice(row.quote.price)}</td>
                  <td className="px-2 py-3 font-mono text-xs tabular-nums text-muted">
                    {fmtPrice(row.zone.low)} – {fmtPrice(row.zone.high)}
                    <span className="block">skip {fmtPrice(row.zone.skipAbove)}</span>
                  </td>
                  <td className="px-2 py-3">
                    <span className={cn("text-sm", row.status === "Skip" ? "text-down" : row.status === "In zone" || row.status === "Below zone" ? "text-up" : "text-muted")}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-3"><Tone value={row.quote.m1} /></td>
                  <td className="px-2 py-3 font-mono tabular-nums">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ranked.length === 0 ? <p className="text-sm text-muted">None of the zoned symbols returned a close.</p> : null}
      </Panel>
      {extras.length ? (
        <Panel title="Watchlist without a zone" kicker="Add a range in Settings if you want them ranked.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {extras.map((symbol) => {
              const quote = by.get(symbol);
              return (
                <li key={symbol} className="flex items-baseline justify-between rounded-lg border border-line px-3 py-2">
                  <span>{UNIVERSE_BY_SYMBOL.get(symbol)?.label ?? symbol}</span>
                  {quote ? <Tone value={quote.d1} /> : <span className="text-sm text-muted">No close</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
