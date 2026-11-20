import type { DeskData } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { Card, Pct, pct, toneText } from "./ui";

export function IncomePanel({ data }: { data: DeskData }) {
  const { rows, volCeiling, volWarn } = data.income;
  return (
    <Card title="Income ETFs" note={`1 year · distributions reinvested · vol ceiling ${Math.round(volWarn * 100)}–${Math.round(volCeiling * 100)}%`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left font-mono text-xs text-subtle">
            <tr>
              <th className="py-1 font-normal">Fund</th>
              <th className="text-right font-normal">Last</th>
              <th className="text-right font-normal">TTM yield</th>
              <th className="text-right font-normal">Total return</th>
              <th className="text-right font-normal">Price return</th>
              <th className="text-right font-normal">Volatility</th>
              <th className="text-right font-normal">Max drawdown</th>
              <th className="text-right font-normal">Last payout</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => (b.tr1y ?? -9) - (a.tr1y ?? -9))
              .map((r) => (
                <tr key={r.symbol} className="border-t border-line">
                  <td className="py-1.5">
                    <span className="font-mono">{r.symbol}</span> <span className="text-xs text-subtle">{r.name}</span>
                  </td>
                  <td className="text-right font-mono tabular-nums">{r.last.toFixed(2)} <span className="text-xs text-subtle">{r.currency}</span></td>
                  <td className="text-right font-mono tabular-nums">{r.ttmYield == null ? "—" : `${(r.ttmYield * 100).toFixed(1)}%`}</td>
                  <td className="text-right"><Pct value={r.tr1y} /></td>
                  <td className="text-right"><Pct value={r.pr1y} /></td>
                  <td className={cn("text-right font-mono tabular-nums", toneText[r.volFlag])}>{r.vol1y == null ? "—" : `${(r.vol1y * 100).toFixed(1)}%`}</td>
                  <td className="text-right"><Pct value={r.mdd1y} /></td>
                  <td className={cn("text-right font-mono tabular-nums", r.cut ? "text-down" : "text-muted")}>
                    {r.lastDist ? `${r.lastDist.amount.toFixed(4)} · ${r.lastDist.date}` : "—"}
                    {r.cut ? " cut" : ""}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-subtle">
        Total return beats yield: a fund whose price return keeps sinking is handing back your capital. Red volatility is above {pct(volCeiling, 0).replace("+", "")};
        "cut" = latest payout ≥10% below the median of the three before it. Change the list with INCOME_TICKERS.
      </p>
    </Card>
  );
}
