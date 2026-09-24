import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSmartMoney } from "@/lib/market/board.functions";
import { fmtCompact } from "@/lib/market/format";
import { Button } from "@/components/ui/button";
import { Empty, Panel } from "@/components/dashboard/bits";

export function Smart() {
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
      <p className="text-sm text-muted">{data.note}</p>
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
                  <span className="font-mono tabular-nums text-muted">{fmtCompact(holding.value)}</span>
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
