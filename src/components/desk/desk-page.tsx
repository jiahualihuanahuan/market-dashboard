import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getDesk } from "@/lib/desk/desk.functions";
import type { DeskData } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { Card, Dot, Pct, Spark, pct, toneText } from "./ui";
import { IncomePanel } from "./income";

const TABS = [
  { id: "desk", label: "Desk" },
  { id: "income", label: "Income" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function DeskPage({ tab, onTab }: { tab: TabId; onTab: (tab: TabId) => void }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["desk"],
    queryFn: () => getDesk({ data: {} }),
    staleTime: 55_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;
  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Market Desk</h1>
          <p className="font-mono text-xs text-subtle">
            {data ? `Closes as of ${data.asOf} · US market ${data.marketState} · updated ${new Date(data.fetchedAt).toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-lg border border-line p-0.5" aria-label="Pages">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={cn("rounded-md px-3 py-1 text-sm", tab === t.id ? "bg-elevated text-fg" : "text-muted hover:text-fg")}
                aria-current={tab === t.id ? "page" : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1 text-sm text-muted hover:text-fg disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              try {
                client.setQueryData(["desk"], await getDesk({ data: { fresh: true } }));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>
      {query.error && !data ? <p className="text-sm text-down">{query.error instanceof Error ? query.error.message : "Desk did not load."}</p> : null}
      {data ? tab === "income" ? <IncomePanel data={data} /> : <DeskPanel data={data} /> : null}
      <p className="mt-6 text-xs text-subtle">
        Ideas: Shepherd Capital Markets (framework), Shanghao Jin (alert levels), Passive Income Investing (income ETFs). Unofficial, delayed public data
        (Yahoo, FRED). Not investment advice.
      </p>
    </div>
  );
}

function DeskPanel({ data }: { data: DeskData }) {
  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Dot tone={data.regime.tone} />
          <h2 className={cn("text-lg font-medium tracking-tight", toneText[data.regime.tone])}>{data.regime.title}</h2>
        </div>
        {data.regime.lines.map((line) => (
          <p key={line} className="mt-1 text-sm text-muted">{line}</p>
        ))}
        {data.alerts.length ? (
          <ul className="mt-3 grid gap-1">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <span className={cn("rounded px-1.5 font-mono text-[10px] uppercase", a.severity === "high" ? "bg-down/20 text-down" : "bg-warn/20 text-warn")}>{a.severity}</span>
                <span>{a.text}</span>
                <span className="font-mono text-xs text-subtle">{a.source}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-subtle">No alert rules firing.</p>
        )}
      </section>

      <Card title="Market map" note="200-day line = bull/bear line">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left font-mono text-xs text-subtle">
              <tr>
                <th className="py-1 font-normal">Tape</th>
                <th className="text-right font-normal">Last</th>
                <th className="text-right font-normal">1d</th>
                <th className="text-right font-normal">1m</th>
                <th className="text-right font-normal">From 1y high</th>
                <th className="text-right font-normal">vs 200-day</th>
                <th className="text-right font-normal">20-day slope</th>
                <th className="pl-3 font-normal">60 days</th>
              </tr>
            </thead>
            <tbody>
              {data.map.map((r) => (
                <tr key={r.symbol} className="border-t border-line">
                  <td className="py-1.5">
                    <span className="font-medium">{r.name}</span> <span className="font-mono text-xs text-subtle">{r.symbol}</span>
                  </td>
                  <td className="text-right font-mono tabular-nums">{r.last.toFixed(2)}</td>
                  <td className="text-right"><Pct value={r.d1} /></td>
                  <td className="text-right"><Pct value={r.m1} /></td>
                  <td className="text-right"><Pct value={r.fromHigh} /></td>
                  <td className="text-right">
                    <span className={cn("font-mono tabular-nums", r.above200 == null ? "text-subtle" : r.above200 ? "text-up" : "text-down")}>
                      {r.above200 == null ? "—" : `${r.above200 ? "above" : "below"} ${pct(r.vs200)}`}
                    </span>
                  </td>
                  <td className="text-right"><Pct value={r.slope20} digits={2} /></td>
                  <td className="pl-3"><Spark values={r.spark} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Crash or correction?" note="credit · volatility · rates · jobs">
          <ul className="grid gap-2">
            {data.risk.map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                <span className="mt-1.5"><Dot tone={r.tone} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{r.label}</span>
                    <span className={cn("font-mono text-sm tabular-nums", toneText[r.tone])}>{r.value}</span>
                  </div>
                  <p className="text-xs text-subtle">{r.detail}{r.asOf ? ` · ${r.asOf}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-4">
          <Card title="Relative strength" note="return gap, 20d / 60d">
            <ul className="grid gap-1.5 text-sm">
              {data.rs.map((r) => (
                <li key={r.label} className="flex items-baseline justify-between gap-2">
                  <span>{r.label} <span className="font-mono text-xs text-subtle">{r.a}/{r.b}</span></span>
                  <span className="flex gap-3"><Pct value={r.spread20} /><Pct value={r.spread60} /></span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-2 border-t border-line pt-1.5">
                <span>Gold / silver <span className="font-mono text-xs text-subtle">120-day hedged Z</span></span>
                <span className="font-mono tabular-nums">
                  {data.goldSilver.ratio == null ? "—" : data.goldSilver.ratio.toFixed(1)} · Z {data.goldSilver.z == null ? "—" : data.goldSilver.z.toFixed(2)}
                </span>
              </li>
              <li className="text-xs text-subtle">{data.goldSilver.note}</li>
            </ul>
          </Card>

          <Card title="What happened next" note={`Nasdaq-100 (${data.history.symbol}), 5 years`}>
            <p className="mb-2 text-xs text-subtle">
              Days down {pct(data.history.threshold)} or worse within 8% of the 1-year high ({data.history.n} cases). Today {pct(data.history.todayRet)}.
            </p>
            <table className="w-full text-sm">
              <thead className="font-mono text-xs text-subtle">
                <tr><th className="text-left font-normal">After</th><th className="text-right font-normal">Median</th><th className="text-right font-normal">Up share</th></tr>
              </thead>
              <tbody>
                {([["5 days", data.history.d5], ["1 month", data.history.d21], ["6 months", data.history.d126]] as const).map(([label, s]) => (
                  <tr key={label} className="border-t border-line">
                    <td className="py-1">{label}</td>
                    <td className="text-right"><Pct value={s.med} /></td>
                    <td className="text-right font-mono tabular-nums">{s.up == null ? "—" : `${Math.round(s.up * 100)}%`}</td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="py-1">200-day touch → 60d</td>
                  <td className="text-right"><Pct value={data.history.line.touch.med60} /></td>
                  <td className="text-right font-mono tabular-nums">{data.history.line.touch.n} cases</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="py-1">200-day break → 60d</td>
                  <td className="text-right"><Pct value={data.history.line.break.med60} /></td>
                  <td className="text-right font-mono tabular-nums">{data.history.line.break.n} cases</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      {data.missing.length ? <p className="text-xs text-subtle">No data for: {data.missing.join(", ")}</p> : null}
    </div>
  );
}
