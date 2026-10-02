import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInsiders } from "@/lib/market/board.functions";
import type { InsiderName, InsiderPin, InsiderPrint, InsiderSide } from "@/lib/market/insiders.server";
import { fmtCompact } from "@/lib/market/format";
import { Panel } from "@/components/dashboard/bits";

export function InsidersTab() {
  const freshRef = useRef(false);
  const query = useQuery({
    queryKey: ["insiders"],
    queryFn: () => {
      const fresh = freshRef.current;
      freshRef.current = false;
      return getInsiders({ data: { fresh } });
    },
    staleTime: 30 * 60 * 1000,
  });
  useEffect(() => {
    const onRefresh = () => {
      freshRef.current = true;
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  if (query.isPending) return <p className="text-sm text-muted">Reading the latest Form 4s and politician disclosures. The first pass takes about half a minute.</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Insider filings did not load."}</p>;
  }
  const book = query.data;
  return (
    <div className="grid min-w-0 gap-4">
      <p className="max-w-3xl text-sm text-muted">{book.note}</p>
      {book.error ? <p className="text-sm text-muted">{book.error}</p> : null}
      <Pins pins={book.pins ?? []} />
      <Group
        title="Politicians"
        kicker={`${book.politicianWindow || "Last 90 days"} · ${book.politicianCount.toLocaleString("en-US")} stock trades`}
        body="House and Senate members file a dollar range, not an exact amount. The ranking uses the bottom of each range, so the figure is a floor. A filing can show up 45 days after the trade. Bonds and private funds are left out. The source is the public House Clerk and Senate filings, compiled through the date on the right."
        side={book.politicians}
        range
      />
      <Group
        title="Company executives"
        kicker={`${book.executiveWindow || "Last 14 days"} · ${book.executiveCount.toLocaleString("en-US")} open-market trades in the latest 240 Form 4s`}
        body="Only open-market buys and sells are counted. A grant, a gift, or an option exercise is left out. Dollars are the shares times the price written on the form. This is the latest 240 filings, not every Form 4 of the year."
        side={book.executives}
        range={false}
      />
    </div>
  );
}

function Pins({ pins }: { pins: InsiderPin[] }) {
  if (!pins.length) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {pins.map((pin) => (
        <Panel key={pin.id} title={pin.name} kicker={pin.office}>
          <p className="mb-3 text-sm text-muted">{pin.note}</p>
          {pin.error ? <p className="text-sm text-muted">{pin.error}</p> : null}
          {pin.prints.length ? (
            <>
              <p className="mb-2 text-xs text-muted">
                {pin.count.toLocaleString("en-US")} stock trades in the last 90 days. Showing the latest {pin.prints.length}.
              </p>
              <ul className="max-h-64 overflow-y-auto overscroll-contain">
                {pin.prints.map((print) => (
                  <li key={`${print.url}-${print.symbol}-${print.traded}-${print.side}-${print.value}`} className="border-b border-line py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span>
                        <span className="text-muted">{print.side === "buy" ? "Bought" : "Sold"} </span>
                        <span className="font-mono">{print.symbol}</span>
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">{money(print.value, print.high, true)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {print.name}
                      {print.role ? ` · ${print.role}` : ""}
                      {print.traded ? ` · traded ${print.traded}` : ""}
                      {print.filed ? ` · filed ${print.filed}` : ""}
                      {print.url ? (
                        <>
                          {" · "}
                          <a className="underline-offset-2 hover:underline" href={print.url} target="_blank" rel="noreferrer">Filing</a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function Group({ title, kicker, body, side, range }: { title: string; kicker: string; body: string; side: InsiderSide; range: boolean }) {
  return (
    <div className="grid gap-4">
      <p className="max-w-3xl text-sm text-muted">{body}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <NameList title={`${title} · most bought`} kicker={kicker} rows={side.buys} range={range} empty="No buys in this window." />
        <NameList title={`${title} · most sold`} kicker="Same window" rows={side.sells} range={range} empty="No sales in this window." />
      </div>
      <Panel title={`${title} · largest single trades`} kicker="The biggest lines, not the total.">
        {side.prints.length ? (
          <ul className="max-h-80 overflow-y-auto overscroll-contain">
            {side.prints.map((print) => (
              <PrintRow key={`${print.url}-${print.symbol}-${print.traded}-${print.side}-${print.value}`} print={print} range={range} />
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No single trades in this window.</p>}
      </Panel>
    </div>
  );
}

function NameList({ title, kicker, rows, range, empty }: { title: string; kicker: string; rows: InsiderName[]; range: boolean; empty: string }) {
  return (
    <Panel title={title} kicker={kicker}>
      {rows.length ? (
        <ul className="max-h-80 overflow-y-auto overscroll-contain">
          {rows.map((row) => (
            <li key={row.symbol} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm">
              <span>
                <span className="font-mono">{row.symbol}</span>
                <span className="ml-2 text-muted">{row.name}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {row.trades} {row.trades === 1 ? "trade" : "trades"} · {row.peopleCount} {row.peopleCount === 1 ? "person" : "people"}
                  {row.people.length ? ` · ${row.people.join(", ")}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums">{money(row.value, row.high, range)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">{empty}</p>}
    </Panel>
  );
}

function PrintRow({ print, range }: { print: InsiderPrint; range: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm">
      <span>
        <a className="underline-offset-2 hover:underline" href={print.url} target="_blank" rel="noreferrer">{print.person}</a>
        <span className="text-muted"> {print.side === "buy" ? "bought" : "sold"} </span>
        <span className="font-mono">{print.symbol}</span>
        <span className="mt-0.5 block text-xs text-muted">
          {print.role ? `${print.role} · ` : ""}traded {print.traded || "—"}{print.filed ? ` · filed ${print.filed}` : ""}
        </span>
      </span>
      <span className="shrink-0 font-mono tabular-nums">{money(print.value, print.high, range)}</span>
    </li>
  );
}

function money(low: number, high: number | null, range: boolean): string {
  if (!range || high == null) return `$${fmtCompact(low)}`;
  return `$${fmtCompact(low)}–$${fmtCompact(high)}`;
}
