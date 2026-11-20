import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIncome } from "@/lib/market/board.functions";
import { VOL_CEILING, VOL_OK, type IncomeRow } from "@/lib/market/income";
import { fmtPct, fmtPrice } from "@/lib/market/format";
import { Panel, Tone } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const VOL_CLASS: Record<IncomeRow["volTone"], string> = {
  ok: "text-up",
  edge: "text-warn",
  over: "text-down",
  unknown: "text-muted",
};

function day(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function IncomeTab() {
  const freshRef = useRef(false);
  const query = useQuery({
    queryKey: ["income"],
    queryFn: () => {
      const fresh = freshRef.current;
      freshRef.current = false;
      return getIncome({ data: { fresh } });
    },
    staleTime: 60 * 60 * 1000,
  });
  useEffect(() => {
    const onRefresh = () => {
      freshRef.current = true;
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  if (query.isPending) return <p className="text-sm text-muted">Reading prices and distributions.</p>;
  if (query.isError || !query.data) return <p className="text-sm text-muted">Income ETFs did not load.</p>;
  const { rows, cutPct } = query.data;

  return (
    <Panel
      title="Income ETFs, last 12 months"
      kicker={`Volatility is green under ${VOL_OK}%, amber ${VOL_OK}–${VOL_CEILING}%, red above your ${VOL_CEILING}% ceiling. Tickers come from INCOME_TICKERS.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">Fund</th>
              <th className="px-2 py-2 font-medium">Yield</th>
              <th className="px-2 py-2 font-medium">Total return</th>
              <th className="px-2 py-2 font-medium">Price return</th>
              <th className="px-2 py-2 font-medium">Volatility</th>
              <th className="px-2 py-2 font-medium">Max drawdown</th>
              <th className="px-2 py-2 font-medium">Last payout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-t border-line">
                <td className="py-3 pr-3">
                  <span className="block font-mono">{row.symbol}</span>
                  <span className="text-xs text-muted">{row.price != null ? `${fmtPrice(row.price)} ${row.currency}` : row.error}</span>
                </td>
                <td className="px-2 py-3 font-mono tabular-nums">{row.ttmYield != null ? `${row.ttmYield.toFixed(1)}%` : "—"}</td>
                <td className="px-2 py-3"><Tone value={row.totalReturn} /></td>
                <td className="px-2 py-3"><Tone value={row.priceReturn} /></td>
                <td className={cn("px-2 py-3 font-mono tabular-nums", VOL_CLASS[row.volTone])}>{row.vol != null ? `${row.vol.toFixed(1)}%` : "—"}</td>
                <td className="px-2 py-3 font-mono tabular-nums text-down">
                  {row.maxDrawdown != null ? fmtPct(row.maxDrawdown) : "—"}
                  {row.drawdownYears ? <span className="block text-xs text-muted">over {row.drawdownYears}y</span> : null}
                </td>
                <td className="px-2 py-3">
                  {row.lastPayout ? (
                    <>
                      <span className="block font-mono tabular-nums">{row.lastPayout.amount.toFixed(3)} · {day(row.lastPayout.t)}</span>
                      <span className={cn("text-xs", row.cut ? "text-down" : "text-muted")}>
                        {row.cut ? "Payout cut: " : "3-mo avg "}
                        {row.payoutChange != null ? fmtPct(row.payoutChange) : "—"}
                        {row.cut ? "" : " vs prior 3 mo"}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Total return reinvests every payout on its ex-date; price return ignores payouts, so the gap between them is the income.
        A high yield with a falling price return is the fund paying you back your own money. Payout cut means the average payout
        of the last 3 months is more than {cutPct}% below the 3 months before, so normal month-to-month swings in variable payers
        like JEPQ are not flagged. Max drawdown is the worst fall from a peak with payouts reinvested.
      </p>
    </Panel>
  );
}
