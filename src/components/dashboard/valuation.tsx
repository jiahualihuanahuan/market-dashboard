import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getValuation } from "@/lib/market/board.functions";
import type { ValuationRow } from "@/lib/market/valuation";
import { fmtPct } from "@/lib/market/format";
import { Panel } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

export function ValuationTab() {
  const [symbol, setSymbol] = useState("");
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const freshRef = useRef(false);
  const query = useQuery({
    queryKey: ["valuation", symbol],
    queryFn: () => {
      const fresh = freshRef.current;
      freshRef.current = false;
      return getValuation({ data: { symbol, fresh } });
    },
    staleTime: 6 * 60 * 60 * 1000,
  });
  useEffect(() => {
    const onRefresh = () => {
      freshRef.current = true;
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  if (query.isPending) return <p className="text-sm text-muted">Reading prices, earnings, cash, and debt for the large-company list.</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Valuation did not load."}</p>;
  }
  const book = query.data;
  const active = book.rows.find((row) => row.symbol === picked) ?? book.rows[0];
  return (
    <div className="grid min-w-0 gap-4">
      <Panel title="What the price leaves out" kicker={`Hurdle rate ${(book.discount * 100).toFixed(1)}% · most undervalued at the top`}>
        <p className="max-w-3xl text-sm text-muted">{book.note}</p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Intrinsic value looks at the business itself: future cash, or the dividends, turned into today's dollars. Relative value looks sideways: is the price high or low next to other companies, using earnings, net worth, operating profit, and growth. Two checks sit on top. Earnings quality asks whether the profit showed up as cash. Balance-sheet health asks whether debt is large next to what the owners have left. Leadership, a moat (a lasting advantage rivals cannot copy), and the industry's weather are real, and they are not in the score.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          This is more useful for a steady company that already makes money. It is a poor guide for a money-losing company, a bank's cash flow, a boom-and-bust commodity producer, or any name whose growth guess is wrong. The hurdle rate is the 10-year Treasury yield plus a 4.5 point cushion for owning stocks instead of government bonds.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim().toUpperCase();
            if (next) {
              setSymbol(next);
              setPicked(next);
            }
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a ticker"
            aria-label="Add a ticker to the valuation rank"
            className="h-11 w-full max-w-xs rounded-md border border-line bg-bg px-3 text-sm"
          />
          <button type="submit" className="h-11 shrink-0 rounded-full border border-line px-4 text-sm">
            Add
          </button>
        </form>
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Panel title="Most undervalued first" kicker={`${book.rows.length} companies`}>
          <ul className="max-h-[40rem] overflow-y-auto overscroll-contain pr-1">
            {book.rows.map((row) => (
              <li key={row.symbol}>
                <button
                  type="button"
                  onClick={() => setPicked(row.symbol)}
                  className={cn("grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-left", row.symbol === active?.symbol ? "text-fg" : "text-muted")}
                >
                  <span className="font-mono text-xs whitespace-nowrap">{row.symbol}</span>
                  <span className="h-2.5 overflow-hidden rounded-sm bg-elevated">
                    <span className="block h-full rounded-sm" style={{ width: `${row.score}%`, background: barColor(row.label) }} />
                  </span>
                  <span className="font-mono text-xs tabular-nums">{row.score}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">100 would mean cheaper than every peer on every measure we have. 0 would mean the most expensive. Most names land in between.</p>
        </Panel>
        {active ? <Detail row={active} /> : null}
      </div>
    </div>
  );
}

function Detail({ row }: { row: ValuationRow }) {
  const items: { label: string; value: string; plain: string }[] = [
    { label: "Price to earnings", value: multiple(row.pe), plain: "Share price divided by the last year's profit per share. A lower number is cheaper. It breaks when the company lost money." },
    { label: "Forward price to earnings", value: multiple(row.forwardPe), plain: "Same idea, using the profit analysts expect over the next year. The expectation can be wrong." },
    { label: "Price to book", value: multiple(row.pb), plain: "Price compared with the net worth on the balance sheet. Useful for banks. Less useful when the value is a brand, not a factory." },
    { label: "EV / EBITDA", value: multiple(row.evEbitda), plain: "The whole business, including debt, compared with operating profit before interest, tax, and non-cash charges. Lower is cheaper." },
    { label: "PEG", value: multiple(row.peg), plain: "Price-to-earnings divided by the growth rate. It asks whether a high multiple is justified by faster growth. Around 1 is the old rule of thumb." },
    { label: "Cash-flow yield", value: row.fcfYield == null ? "—" : `${row.fcfYield.toFixed(1)}%`, plain: "Free cash flow, the cash left after running and maintaining the business, divided by the price of the whole company." },
    { label: "Cash-flow model", value: row.dcfUpside == null ? "—" : fmtPct(row.dcfUpside), plain: "Today's value of that cash if it grows slowly and you demand the hurdle rate. Positive means the model says the shares are cheap." },
    { label: "Dividend model", value: row.ddmUpside == null ? "—" : fmtPct(row.ddmUpside), plain: "The same idea using the dividend instead of all the cash. Blank when the company barely pays one." },
    { label: "Earnings quality", value: row.earningsQuality == null ? "—" : `${row.earningsQuality.toFixed(2)}×`, plain: "Cash from operations divided by reported profit. Near 1 means the profit showed up as cash. Well below 1 means the profit is ahead of the cash." },
    { label: "Debt to equity", value: row.debtToEquity == null ? "—" : `${row.debtToEquity.toFixed(1)}×`, plain: "How much is owed for each dollar of net worth. Above 2 is a heavy load for most businesses." },
    { label: "Growth on file", value: row.growth == null ? "—" : fmtPct(row.growth * 100), plain: "The growth rate the feed has for earnings, or for sales if earnings growth is missing. The models refuse to assume this stays above 5% forever." },
  ];
  return (
    <Panel title={`${row.symbol} · ${row.label}`} kicker={row.sector}>
      <p className="text-sm font-medium">{row.name}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">Score {row.score}</p>
      <dl className="mt-3 grid gap-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <dt>{item.label}</dt>
              <dd className="font-mono tabular-nums">{item.value}</dd>
            </div>
            <p className="text-xs text-muted">{item.plain}</p>
          </div>
        ))}
      </dl>
      <ul className="mt-3 grid gap-1">
        {row.notes.map((note) => (
          <li key={note} className="text-xs text-muted">{note}</li>
        ))}
      </ul>
    </Panel>
  );
}

function multiple(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function barColor(label: ValuationRow["label"]): string {
  if (label === "Undervalued") return "var(--color-up)";
  if (label === "Overvalued") return "var(--color-down)";
  return "var(--color-muted)";
}
