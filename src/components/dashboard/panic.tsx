import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Board } from "@/lib/market/types";
import { getPanic } from "@/lib/market/board.functions";
import { breadthPanic, drawdownPanic, fearPanic, panicWords, percentile, vixPanic } from "@/lib/market/panic";
import { RANGES, sliceSeries, type RangeId } from "@/lib/market/tape";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

const RANGES_USED = RANGES.filter(([id]) => id !== "day");

export function Panic({ board }: { board: Board }) {
  const [range, setRange] = useState<RangeId>("y1");
  const liveRef = useRef(false);
  const query = useQuery({
    queryKey: ["panic-history"],
    queryFn: () => {
      const live = liveRef.current;
      liveRef.current = false;
      return getPanic({ data: { live } });
    },
    staleTime: 6 * 60 * 60 * 1000,
  });
  useEffect(() => {
    const onRefresh = () => {
      liveRef.current = true;
      void query.refetch();
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  const vix = board.quotes.find((quote) => quote.symbol === "^VIX")?.price ?? null;
  const spx = board.quotes.find((quote) => quote.symbol === "^GSPC");
  const book = board.breadth.source === "spx" ? "S&P 500" : "tracked book";
  const downPct = board.breadth.universe ? (board.breadth.down / board.breadth.universe) * 100 : null;
  const hy = board.hyOas;
  const cnn = board.fearCnn?.score ?? null;
  const hySample = (board.stress.find((row) => row.id === "hy")?.points ?? []).map((point) => point.v).filter((value) => value > 0);
  const legs = [
    {
      id: "vix",
      label: "Insurance price",
      score: vix == null ? null : Math.round(vixPanic(vix)),
      value: vix == null ? "—" : vix.toFixed(1),
      plain: "VIX is the price of 30-day protection on the S&P 500. Around 14 is calm. Around 30 is a scramble. Around 40 is rare. A high price means traders are paying up to be protected.",
    },
    {
      id: "breadth",
      label: "How many stocks fell",
      score: downPct == null ? null : Math.round(breadthPanic(downPct)),
      value: downPct == null ? "—" : `${downPct.toFixed(0)}%`,
      plain: `The share of ${book} members that fell. A falling index can be a few giant stocks. A panic is most stocks falling at once. Around 40% down is an ordinary day. Around 80% is a flush.`,
    },
    {
      id: "hy",
      label: "Junk-bond extra yield",
      score: hy == null || hySample.length < 20 ? null : Math.round(percentile(hy, hySample)),
      value: hy == null ? "—" : `${hy.toFixed(2)} pts`,
      plain: "High-yield OAS is the extra interest lenders demand to hold risky company bonds instead of Treasuries. A wide gap means lenders are scared, not just stock traders. The score is how unusual today's gap is against the history on this page.",
    },
    {
      id: "fear",
      label: "CNN fear reading",
      score: cnn == null ? null : Math.round(fearPanic(cnn)),
      value: cnn == null ? "—" : `${Math.round(cnn)} ${board.fearCnn?.rating ?? ""}`.trim(),
      plain: "CNN blends several of these clues into one 0–100 mood number. Low is fear. It is not a separate fact, so it should not be counted as a new vote. It is here so you can see the published mood next to the pieces.",
    },
    {
      id: "drop",
      label: "Drop from the yearly high",
      score: spx && spx.high52 ? Math.round(drawdownPanic(spx.price, spx.high52)) : null,
      value: spx && spx.high52 ? `${((spx.price / spx.high52 - 1) * 100).toFixed(1)}%` : "—",
      plain: "How far the S&P 500 is below its high of the last year. A deep drop with calm credit is a repricing. A deep drop with expensive insurance and wide credit is more likely forced selling.",
    },
  ];
  const used = legs.filter((leg) => leg.id !== "fear" && leg.score != null);
  const score = used.length ? Math.round(used.reduce((sum, leg) => sum + (leg.score ?? 0), 0) / used.length) : null;
  const words = score == null ? null : panicWords(score);
  const hot = used.filter((leg) => (leg.score ?? 0) >= 60).length;
  const line = useMemo(() => sliceSeries(query.data?.points ?? [], range), [query.data, range]);

  return (
    <div className="grid min-w-0 gap-4">
      <Panel title={words?.label ?? "Panic"} kicker={score == null ? "Waiting on the feeds" : `Score ${score} of 100`}>
        <p className="max-w-3xl text-sm text-muted">
          A market is inefficient, in this sense, when the price is set by people who have to sell rather than by a calm estimate of what the asset is worth. Panic is the usual cause. This page looks for that scramble in more than one place. One hot gauge is often just a story. Several at once is when a price is least trustworthy as a measure of value.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted">{words?.plain}</p>
        {score != null ? (
          <p className="mt-3 max-w-3xl text-sm text-muted">
            {score >= 75 && hot >= 3
              ? "Insurance, credit, and the tape agree. This is the zone where the market is most likely inefficient."
              : hot < 2
                ? "The gauges do not agree. A single spike is not enough to call the market inefficient."
                : "Some of the gauges agree. Treat the price as less reliable than usual, not as broken."}
            {" "}This is not a buy or sell instruction. Panic can get worse. The reading also fails when the bad news is real and lasting, because then the lower price is the right one.
          </p>
        ) : null}
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-elevated">
          <div className="h-3 rounded-full" style={{ width: `${score ?? 0}%`, background: score != null && score >= 55 ? "var(--color-down)" : "var(--color-muted)" }} />
        </div>
      </Panel>

      <Panel title="The pieces" kicker="Higher means more panic. CNN is shown, not averaged in.">
        <ul className="grid gap-4">
          {legs.map((leg) => (
            <li key={leg.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span>{leg.label}</span>
                <span className="font-mono tabular-nums">{leg.value}{leg.score == null ? "" : ` · ${leg.score}`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-elevated">
                <div className="h-2 rounded-full bg-fg/80" style={{ width: `${leg.score ?? 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{leg.plain}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="min-w-0" title="Insurance and credit together" kicker="The long record. Breadth is not in this line.">
        <p className="mb-3 max-w-3xl text-sm text-muted">
          Each point is the average of two things: how expensive stock insurance was that day, and how unusual the junk-bond extra yield was versus the prior year. The public file for that yield only goes back about three years, so the longer buttons show the whole file. Today's score above also uses how many stocks fell and how far the index is from its high. Those two are not in this line.
        </p>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {RANGES_USED.map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={cn("h-11 shrink-0 rounded-full border px-3 text-sm", range === id ? "border-fg bg-elevated text-fg" : "border-line text-muted")}
            >
              {name}
            </button>
          ))}
        </div>
        {query.isPending ? <p className="text-sm text-muted">Reading insurance prices and junk-bond yields.</p> : null}
        {query.isError ? <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "Panic history did not load."}</p> : null}
        {line.length > 1 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={line} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "var(--color-subtle)", fontSize: 11 }} minTickGap={28} />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--color-subtle)", fontSize: 11 }} width={36} />
                <ReferenceLine y={55} stroke="var(--color-warn)" strokeDasharray="4 4" />
                <ReferenceLine y={75} stroke="var(--color-down)" strokeDasharray="4 4" />
                <Tooltip {...tooltipStyle} formatter={(value, name) => [typeof value === "number" ? (name === "score" ? value.toFixed(0) : value.toFixed(2)) : "—", name === "score" ? "Panic" : name === "vix" ? "VIX" : "Junk extra yield"]} />
                <Line dataKey="score" name="score" stroke="var(--color-fg)" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted">The upper dashed line is 75, the panic zone. The lower one is 55, stressed. The line is not a forecast.</p>
      </Panel>
    </div>
  );
}
