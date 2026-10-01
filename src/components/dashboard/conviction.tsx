import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getConviction, getOllama } from "@/lib/market/conviction.functions";
import { TECH_UNIVERSE, type ConvictionMemo } from "@/lib/market/conviction";
import { Panel } from "@/components/dashboard/bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_HOST = "http://192.168.86.35:11434";

export function ConvictionTab() {
  const [ticker, setTicker] = useState("NVDA");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [model, setModel] = useState("qwen3:8b");
  const [memo, setMemo] = useState<ConvictionMemo | null>(null);
  const [probe, setProbe] = useState("");
  const run = useMutation({
    mutationFn: (fresh: boolean) => getConviction({ data: { ticker, fresh, host, model } }),
    onSuccess: setMemo,
  });
  const check = useMutation({
    mutationFn: () => getOllama({ data: { host, model } }),
    onSuccess: (result) => setProbe(result.error ?? `Reached ${result.host}. Models: ${result.models.join(", ") || "none pulled"}`),
  });

  return (
    <div className="grid gap-4">
      <Panel title="Build a note" kicker="Same Ollama Open WebUI uses. Headlines only. Not a recommendation.">
        <div className="grid gap-2 md:grid-cols-[1fr_12rem_auto_auto]">
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            className="h-11 rounded-md border border-line bg-surface px-3 font-mono text-sm"
            aria-label="Ollama host"
          />
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="h-11 rounded-md border border-line bg-surface px-3 font-mono text-sm"
            aria-label="Model"
          />
          <Button variant="line" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? "Checking" : "Test Ollama"}
          </Button>
          <Button disabled={run.isPending} onClick={() => run.mutate(true)}>
            {run.isPending ? "Writing" : "Build conviction"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted" htmlFor="conviction-ticker">Company</label>
          <select
            id="conviction-ticker"
            value={ticker}
            onChange={(event) => setTicker(event.target.value)}
            className="h-11 rounded-md border border-line bg-surface px-3 text-sm"
          >
            {TECH_UNIVERSE.map((row) => (
              <option key={row.ticker} value={row.ticker}>{row.name} · {row.ticker}</option>
            ))}
          </select>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Host is the machine Open WebUI already reaches. Leave off /v1. The model name has to match a pulled tag.
        </p>
        {probe ? <p className="mt-3 text-sm text-muted">{probe}</p> : null}
        {check.isError ? <p className="mt-3 text-sm text-down">{check.error instanceof Error ? check.error.message : "Check failed."}</p> : null}
        {run.isError ? <p className="mt-3 text-sm text-down">{run.error instanceof Error ? run.error.message : "The note failed."}</p> : null}
      </Panel>
      {memo ? <Memo memo={memo} /> : null}
    </div>
  );
}

function Memo({ memo }: { memo: ConvictionMemo }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Panel title={`${memo.conviction ?? "—"} / 5`} kicker={memo.company}>
          <p className={cn("text-sm", memo.stance === "cautious" ? "text-down" : memo.stance === "constructive" ? "text-up" : "text-muted")}>{memo.stance}</p>
          <p className="mt-3 text-sm">{memo.whatChanged || "No change statement."}</p>
          <p className="mt-4 font-mono text-xs text-muted">{memo.model}</p>
          {memo.error ? <p className="mt-2 text-sm text-down">{memo.error}</p> : null}
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Points title="Bull" points={memo.bullPoints} />
          <Points title="Bear" points={memo.bearPoints} />
        </div>
      </div>
      <Panel title="What would change it" kicker="Open questions and gaps">
        <ul className="grid gap-2 text-sm">
          {memo.openQuestions.concat(memo.notInSources).map((line) => <li key={line}>{line}</li>)}
        </ul>
        {memo.openQuestions.length + memo.notInSources.length === 0 ? <p className="text-sm text-muted">None returned.</p> : null}
      </Panel>
      <Panel title="Headlines used" kicker="Ranked away from price-target notes">
        <ul className="grid gap-3">
          {memo.articles.map((article, index) => (
            <li key={article.id}>
              <a className="text-sm font-medium hover:underline" href={article.url} target="_blank" rel="noreferrer">[{index + 1}] {article.title}</a>
              <p className="font-mono text-xs text-muted">{article.source}</p>
            </li>
          ))}
        </ul>
        {memo.articles.length === 0 ? <p className="text-sm text-muted">No headlines came back.</p> : null}
      </Panel>
    </>
  );
}

function Points({ title, points }: { title: string; points: ConvictionMemo["bullPoints"] }) {
  return (
    <Panel title={title}>
      {points.length === 0 ? <p className="text-sm text-muted">None.</p> : null}
      <ul className="grid gap-3">
        {points.map((point) => (
          <li key={point.claim}>
            <p className="text-sm">{point.claim}</p>
            <p className="font-mono text-xs text-muted">{point.evidence} · {point.confidence}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
