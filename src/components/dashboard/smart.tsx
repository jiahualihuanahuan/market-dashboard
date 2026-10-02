import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHolderBook, getHolders, getSmartMoney } from "@/lib/market/board.functions";
import { fmtCompact } from "@/lib/market/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Panel } from "@/components/dashboard/bits";

export function Smart() {
  return (
    <div className="grid gap-4">
      <Holders />
      <Famous />
    </div>
  );
}

function Holders() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [cik, setCik] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const directory = useQuery({
    queryKey: ["holders", query],
    queryFn: () => getHolders({ data: { query } }),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const book = useQuery({
    queryKey: ["holder-book", cik],
    queryFn: () => getHolderBook({ data: { cik: cik ?? "" } }),
    enabled: Boolean(cik),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const data = directory.data;

  return (
    <>
      <Panel title="Every 13F filer" kicker={data ? `${data.managerCount.toLocaleString("en-US")} institutions · quarter ended ${data.quarter || "—"}` : "SEC quarterly file"}>
        <p className="max-w-3xl text-sm text-muted">
          A CIK is the SEC’s id number for a filer. This list is every institution in the SEC’s latest Form 13F data set, not a hand-picked group. Search a name or a CIK to open that institution’s stocks. The aggregate is every stock those filings added together. The percent next to an institution or a stock is its share of all reported stock dollars. Inside one institution, the percent is that stock’s share of the book. Options are left out. The file is as of the quarter end, and it usually arrives about 45 days later. Dollars are as filed, not today’s price.
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-muted">Institution, CIK, or stock</span>
          <Input className="mt-2" value={text} placeholder="Berkshire, 0001067983, or Apple" onChange={(event) => setText(event.target.value)} />
        </label>
        {directory.isPending ? <p className="mt-3 text-sm text-muted">Reading the SEC file. The first time takes about a minute.</p> : null}
        {directory.isError ? <p className="mt-3 text-sm text-muted">{directory.error instanceof Error ? directory.error.message : "The 13F file did not load."}</p> : null}
        {data ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">{query ? "Matching institutions" : "Largest institutions"}</h3>
              {data.managers.length === 0 ? <p className="text-sm text-muted">No institution matches.</p> : null}
              <ul>
                {data.managers.map((manager) => (
                  <li key={manager.cik} className="border-t border-line">
                    <button type="button" className="flex w-full items-baseline justify-between gap-3 py-2 text-left text-sm" onClick={() => setCik(manager.cik)}>
                      <span>
                        <span className="block">{manager.name}</span>
                        <span className="font-mono text-xs text-muted">CIK {manager.cik}</span>
                      </span>
                      <span className="font-mono tabular-nums text-muted">${fmtCompact(manager.value)} · {share(manager.value, data.managerTotal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">{query ? "Matching stocks" : `Largest stocks · ${data.issuerCount.toLocaleString("en-US")} reported`}</h3>
              {data.aggregate.length === 0 ? <p className="text-sm text-muted">No stock matches.</p> : null}
              <ul>
                {data.aggregate.map((row) => (
                  <li key={row.cusip || row.issuer} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm">
                    <span>
                      <span className="block">{row.issuer}</span>
                      <span className="text-xs text-muted">{row.managers.toLocaleString("en-US")} institutions{row.cusip ? ` · ${row.cusip}` : ""}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted">${fmtCompact(row.value)} · {share(row.value, data.stockTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Panel>
      {cik ? (
        <Panel
          title={book.data?.name || "Institution"}
          kicker={book.data ? `CIK ${book.data.cik}${book.data.period ? ` · period ${book.data.period}` : ""}` : "Latest 13F"}
          action={book.data?.url ? (
            <a className="text-sm text-muted underline-offset-2 hover:underline" href={book.data.url} target="_blank" rel="noreferrer">Filing</a>
          ) : null}
        >
          {book.isPending ? <p className="text-sm text-muted">Reading that institution’s latest 13F.</p> : null}
          {book.isError ? <p className="text-sm text-muted">{book.error instanceof Error ? book.error.message : "That filing did not load."}</p> : null}
          {book.data?.error ? <p className="text-sm text-muted">{book.data.error}</p> : null}
          {book.data && !book.data.error ? (
            <>
              <p className="mb-3 text-sm text-muted">
                {book.data.count.toLocaleString("en-US")} stocks, ${fmtCompact(book.data.value)} reported. Showing the {book.data.holdings.length} largest. Filed {book.data.filed || "—"}.
              </p>
              <ul>
                {book.data.holdings.map((holding) => (
                  <li key={holding.issuer} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm">
                    <span>{holding.issuer}</span>
                    <span className="font-mono tabular-nums text-muted">${fmtCompact(holding.value)} · {share(holding.value, book.data.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}

function share(part: number, total: number): string {
  if (!(total > 0) || !Number.isFinite(part)) return "—";
  const value = (part / total) * 100;
  const digits = value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
}

function Famous() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["smart-money"],
    queryFn: () => getSmartMoney({ data: { fresh: false } }),
    staleTime: 30 * 60 * 1000,
  });

  if (query.isPending) {
    return <Panel title="Reading SEC filings" kicker="13Fs and the last few days of Form 4s"><p className="text-sm text-muted">This usually takes a few seconds.</p></Panel>;
  }
  if (query.isError || !query.data) {
    return (
      <Panel title="Filings did not load" kicker="SEC">
        <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Try again."}</p>
        <Button className="mt-3" variant="line" onClick={() => query.refetch()}>Retry</Button>
      </Panel>
    );
  }
  const data = query.data;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        A 13F is the quarterly list of US stocks a large manager must file with the SEC, usually about 45 days after the quarter ends. It is late, and it misses bets against stocks and most foreign holdings. A Form 4 is the notice when a director or senior officer buys or sells their own company’s shares. That one is much closer to today. {data.note}
      </p>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={async () => {
            const next = await getSmartMoney({ data: { fresh: true } });
            client.setQueryData(["smart-money"], next);
          }}
        >
          Refresh filings
        </Button>
      </div>
      <Panel title="Owned by more than one of these books" kicker="Top holdings only, so this is overlap inside the disclosed leaders, not the whole 13F.">
        {data.overlap.length === 0 ? (
          <Empty title="No overlap in the top lines" body="The parsed leaders do not share a name, or the filings did not parse." />
        ) : (
          <ul className="grid gap-2">
            {data.overlap.map((row) => (
              <li key={row.issuer} className="flex flex-col gap-1 border-b border-line py-2 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="font-medium">{row.issuer}</span>
                <span className="text-sm text-muted">{row.managers.join(" · ")}</span>
                <span className="font-mono text-sm tabular-nums">{fmtCompact(row.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.books.map((book) => (
          <Panel key={book.name} title={book.name} kicker={book.who} action={
            <a className="text-sm text-muted underline-offset-2 hover:underline" href={book.url} target="_blank" rel="noreferrer">
              Filing
            </a>
          }>
            <p className="mb-3 text-xs text-muted">
              {book.filed ? `Filed ${book.filed}` : "No date"}
              {book.period ? ` · period ${book.period}` : ""}
            </p>
            {book.error ? <p className="text-sm text-muted">{book.error}</p> : null}
            <ul>
              {book.holdings.map((holding) => (
                <li key={holding.issuer} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm">
                  <span>{holding.issuer}</span>
                  <span className="font-mono tabular-nums text-muted">{fmtCompact(holding.value)}{holding.weight == null ? "" : ` · ${share(holding.weight, 100)}`}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <Panel title="Recent Form 4s" kicker="Last several days, issuer and reporting person as the SEC lists them.">
        <ul className="grid gap-2">
          {data.insiders.map((row) => (
            <li key={row.url + row.filed} className="flex flex-col gap-1 border-b border-line py-2 sm:flex-row sm:justify-between">
              <span className="text-sm">{row.names.join(" · ") || "Unnamed"}</span>
              <a className="font-mono text-xs text-muted underline-offset-2 hover:underline" href={row.url} target="_blank" rel="noreferrer">
                {row.filed}
              </a>
            </li>
          ))}
        </ul>
        {data.insiders.length === 0 ? <p className="text-sm text-muted">No Form 4s came back for the window.</p> : null}
      </Panel>
    </div>
  );
}
