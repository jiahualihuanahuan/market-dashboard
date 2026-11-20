import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStability } from "@/lib/market/board.functions";
import type { StabilityRow, Tone } from "@/lib/market/stability.server";
import { Panel } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const TONE_LABEL: Record<Tone, string> = {
  calm: "Calm",
  caution: "Caution",
  alarm: "Alarm",
  unknown: "No read",
};

export function StabilityTab() {
  const freshRef = useRef(false);
  const query = useQuery({
    queryKey: ["stability"],
    queryFn: () => {
      const fresh = freshRef.current;
      freshRef.current = false;
      return getStability({ data: { fresh } });
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

  if (query.isPending) return <p className="text-sm text-muted">Reading valuation and stress gauges.</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Stability did not load."}</p>;
  }

  const book = query.data;
  const valuation = book.rows.filter((row) => row.group === "valuation");
  const stress = book.rows.filter((row) => row.group === "stress");

  return (
    <div className="grid min-w-0 gap-4">
      <Panel title={book.headline} kicker="Not a crash timer">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge label="Valuation" tone={book.valuation} />
          <Badge label="Near-term stress" tone={book.nearTerm} />
        </div>
        <p className="max-w-3xl text-sm text-muted">{book.summary}</p>
      </Panel>

      <Panel title="Price" kicker="Expensive can last">
        <Rows rows={valuation} />
      </Panel>
      <Panel title="Stress" kicker="What usually moves before equities">
        <Rows rows={stress} />
      </Panel>
      <Panel title="What would look like soon" kicker="Watch the cluster, not one cell">
        <ul className="grid gap-2 text-sm text-muted">
          <li>High-yield spreads through 4.5–6%, not a single tight print.</li>
          <li>VIX holding above 25–30, not a one-day spike.</li>
          <li>Sahm rule climbing toward 0.50.</li>
          <li>CCC stress spreading into BB and BBB, not staying in the weakest names.</li>
        </ul>
      </Panel>
    </div>
  );
}

function Rows({ rows }: { rows: StabilityRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-2 py-3 md:grid-cols-[11rem_8rem_1fr]">
          <div>
            <p className="text-sm">{row.label}</p>
            <p className="font-mono text-xs text-muted">{row.asOf ?? "—"}</p>
          </div>
          <div>
            <p className="font-mono text-sm tabular-nums">{row.value}</p>
            <ToneMark tone={row.tone} />
          </div>
          <div>
            <p className="text-sm text-muted">{row.note}</p>
            <p className="mt-1 text-xs text-subtle">{row.threshold}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Badge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line px-3 text-xs">
      <span className="text-muted">{label}</span>
      <ToneMark tone={tone} />
    </span>
  );
}

function ToneMark({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn(
        "font-mono text-xs",
        tone === "alarm" && "text-down",
        tone === "caution" && "text-muted",
        tone === "calm" && "text-up",
        tone === "unknown" && "text-subtle",
      )}
    >
      {TONE_LABEL[tone]}
    </span>
  );
}
