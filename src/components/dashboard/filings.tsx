import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFilings } from "@/lib/market/filings.functions";
import { DEFAULT_WATCH, type WatchName } from "@/lib/market/filings";
import { Panel } from "@/components/dashboard/bits";
import { Button } from "@/components/ui/button";

const KEY = "market-desk-filings";

function loadWatch(): WatchName[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WATCH;
    const parsed = JSON.parse(raw) as WatchName[];
    return parsed.length ? parsed : DEFAULT_WATCH;
  } catch {
    return DEFAULT_WATCH;
  }
}

export function FilingsTab() {
  const [watch, setWatch] = useState<WatchName[]>(DEFAULT_WATCH);
  const [draft, setDraft] = useState("AAPL");
  const [host, setHost] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWatch(loadWatch());
    setReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["filings", watch, host],
    enabled: ready,
    queryFn: () => getFilings({ data: { watch, days: 10, fresh: false, host } }),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    const onRefresh = () => {
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  const data = query.data;
  const news = data?.items.filter((item) => item.isNew && item.source !== "sedar") ?? [];
  const rest = data?.items.filter((item) => !item.isNew || item.source === "sedar") ?? [];

  return (
    <div className="grid gap-4">
      <Panel
        title="Public filings digest"
        kicker="EDGAR and investor-relations RSS. SEDAR+ is a link, not a feed."
        action={
          <Button
            variant="line"
            disabled={query.isFetching}
            onClick={() => getFilings({ data: { watch, days: 10, fresh: true, host } }).then((next) => query.refetch().then(() => next))}
          >
            {query.isFetching ? "Checking" : "Mark seen"}
          </Button>
        }
      >
        <p className="max-w-2xl text-sm text-muted">
          Once a day is enough. New US filings come from the SEC submissions file. Canadian issuers stay on SEDAR+ because that site has no public JSON. Summaries run on the same Ollama host as Conviction. Mark seen after you have read the new rows so tomorrow only flags what arrived since.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            className="h-11 rounded-md border border-line bg-bg px-3 font-mono text-sm"
            aria-label="Ticker"
          />
          <Button
            variant="line"
            onClick={() => {
              const ticker = draft.trim().toUpperCase();
              if (!ticker || watch.some((row) => row.ticker === ticker)) return;
              const next = [...watch, { ticker, name: ticker, market: "US" as const }];
              setWatch(next);
              localStorage.setItem(KEY, JSON.stringify(next));
            }}
          >
            Add US ticker
          </Button>
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="Ollama host, blank uses server default"
            className="h-11 min-w-64 flex-1 rounded-md border border-line bg-bg px-3 text-sm"
            aria-label="Ollama host"
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {watch.map((row) => (
            <li key={row.ticker}>
              <button
                type="button"
                className="rounded-full border border-line px-3 py-1 font-mono text-xs"
                onClick={() => {
                  const next = watch.filter((item) => item.ticker !== row.ticker);
                  setWatch(next);
                  localStorage.setItem(KEY, JSON.stringify(next));
                }}
              >
                {row.ticker} ×
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {query.isPending ? <p className="text-sm text-muted">Checking EDGAR and IR feeds.</p> : null}
      {query.isError ? <p className="text-sm text-down">{query.error instanceof Error ? query.error.message : "Check failed."}</p> : null}
      {data?.error ? <p className="text-sm text-muted">Model: {data.error}</p> : null}
      {data?.notes.map((note) => (
        <p key={note} className="text-xs text-muted">{note}</p>
      ))}

      <Panel title="New since last mark" kicker={data ? `Checked ${new Date(data.checkedAt).toLocaleString()}` : "Not checked yet"}>
        {news.length === 0 ? <p className="text-sm text-muted">Nothing new in the window, or this is the first pass. Mark seen to start the baseline.</p> : null}
        <div className="grid gap-3">
          {news.map((item) => (
            <article key={item.id} className="rounded-lg border border-line p-3">
              <p className="font-mono text-xs text-muted">{item.ticker} · {item.source} · {item.form} · {item.filedAt} · {item.material}</p>
              <a className="mt-1 block font-medium" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              <p className="mt-2 text-sm text-muted">{item.summary}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Already seen, plus SEDAR+ links" kicker="SEDAR+ cards are not new-filing alerts.">
        <div className="grid gap-3">
          {rest.map((item) => (
            <article key={item.id} className="rounded-lg border border-line p-3">
              <p className="font-mono text-xs text-muted">{item.ticker} · {item.source} · {item.form} · {item.filedAt}</p>
              <a className="mt-1 block text-sm" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              {item.source !== "sedar" ? <p className="mt-2 text-sm text-muted">{item.summary}</p> : <p className="mt-2 text-sm text-muted">{item.excerpt}</p>}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
