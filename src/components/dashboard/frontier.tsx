import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getFrontier } from "@/lib/market/board.functions";
import { mixWithinVol, type FrontierModel, type MixPoint } from "@/lib/market/frontier";
import { fmtPct } from "@/lib/market/format";
import { Panel, tooltipStyle } from "@/components/dashboard/bits";

export function FrontierTab() {
  const liveRef = useRef(false);
  const [held, setHeld] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["frontier-bl"],
    queryFn: () => getFrontier({ data: { live: liveRef.current } }),
    staleTime: 6 * 60 * 60 * 1000,
  });

  useEffect(() => {
    const onRefresh = () => {
      liveRef.current = true;
      void query.refetch().finally(() => {
        liveRef.current = false;
      });
    };
    window.addEventListener("desk-refresh", onRefresh);
    return () => window.removeEventListener("desk-refresh", onRefresh);
  }, [query]);

  if (query.isPending) return <p className="text-sm text-muted">Building five years of overlapping history.</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted">{query.error instanceof Error ? query.error.message : "The frontier did not load."}</p>;
  }
  return <FrontierDesk model={query.data} held={held} onHeld={setHeld} />;
}

function FrontierDesk({
  model,
  held,
  onHeld,
}: {
  model: FrontierModel;
  held: number | null;
  onHeld: (value: number) => void;
}) {
  const floor = model.calmest.vol;
  const ceiling = model.frontier[model.frontier.length - 1]?.vol ?? model.maxSharpe.vol;
  const cap = clamp(held ?? model.maxSharpe.vol, floor, ceiling);
  const chosen = mixWithinVol(model, cap);
  const risky = chosen.vol > model.maxSharpe.vol + 0.2;
  const dots = model.assets.map((asset, index) => ({ ...asset, label: model.labels[index] ?? "" }));
  const spots = sweetSpots(model.frontier);

  return (
    <div className="grid gap-4">
      <Panel
        title="Mix inside a bumpiness limit"
        kicker={`${model.start} to ${model.end} · ${model.days} stock-market days`}
      >
        <p className="max-w-3xl text-sm text-muted">
          The curve is the efficient frontier after four corrections. The return is not the last five years' average. It starts from market-cap weights, reads the return those weights imply, then blends in a forward view from dividends, inflation, and the Treasury yield. Volatility outliers are pulled toward the average. No holding can exceed {model.weightCap.toFixed(0)}%. A 15% cap cannot add up to 100% across five holdings. The slider is still a ceiling on bumpiness, and the desk picks the highest corrected return that stays under it.
        </p>
        <label className="mt-4 block text-sm">
          <span className="flex items-baseline justify-between gap-3">
            <span>Max volatility</span>
            <span className="font-mono tabular-nums">{cap.toFixed(1)}% a year</span>
          </span>
          <input
            className="mt-2 h-11 w-full accent-[var(--color-accent)]"
            type="range"
            min={floor}
            max={ceiling}
            step={0.5}
            value={cap}
            onChange={(event) => onHeld(Number(event.target.value))}
          />
        </label>
        <p className="mt-2 text-sm text-muted">
          {risky
            ? "This is bumpier than the best reward-for-risk mix. You are paying for extra return with a rougher ride, and the Sharpe ratio falls."
            : Math.abs(chosen.vol - model.maxSharpe.vol) < 0.8
              ? "This is the best reward-for-risk mix in the sample, or the closest one still under your ceiling. Sharpe is the extra return over cash divided by volatility."
              : "Under this ceiling the mix holds more bills. It is smoother, and it gives up return. Sharpe stays similar until you pass the best point."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Expected return" value={fmtPct(chosen.ret)} plain="Corrected yearly gain used by the curve. Not the past average, and not a promise." />
          <Stat label="Volatility" value={`${chosen.vol.toFixed(1)}%`} plain="Yearly bumpiness after outliers are pulled toward the average." />
          <Stat label="Sharpe" value={chosen.sharpe.toFixed(2)} plain="Extra return over cash, per unit of bumpiness. Higher is more comfortable reward." />
          <Stat label="Sortino" value={chosen.sortino.toFixed(2)} plain="Like Sharpe, but only the down days count. Upside does not get punished." />
          <Stat label="Worst fall" value={fmtPct(chosen.maxDrawdown)} plain="Largest peak-to-trough drop if you had held this mix and rebalanced every day." />
          <Stat label="Calmar" value={chosen.calmar == null ? "—" : chosen.calmar.toFixed(2)} plain="Yearly return divided by that worst fall. Higher means the crashes were smaller relative to the gain." />
        </div>
      </Panel>

      <Panel title="Where the return comes from" kicker="Past result, forward view, market weight, equilibrium, then the blend the curve uses.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Asset</th>
                <th className="px-2 py-2 font-medium">Past 5y</th>
                <th className="px-2 py-2 font-medium">Forward view</th>
                <th className="px-2 py-2 font-medium">Market weight</th>
                <th className="px-2 py-2 font-medium">Equilibrium</th>
                <th className="px-2 py-2 font-medium">Used</th>
              </tr>
            </thead>
            <tbody>
              {model.bridges.map((row) => (
                <tr key={row.label} className="border-t border-line align-top">
                  <td className="py-3 pr-3">
                    <span className="block">{row.label}</span>
                    <span className="text-xs text-muted">{row.note}</span>
                  </td>
                  <td className="px-2 py-3 font-mono tabular-nums text-muted">{fmtPct(row.historical)}</td>
                  <td className="px-2 py-3 font-mono tabular-nums">{fmtPct(row.forward)}</td>
                  <td className="px-2 py-3 font-mono tabular-nums">{row.marketWeight.toFixed(1)}%</td>
                  <td className="px-2 py-3 font-mono tabular-nums">{fmtPct(row.equilibrium)}</td>
                  <td className="px-2 py-3 font-mono tabular-nums">{fmtPct(row.posterior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Market weight is the neutral mix: bitcoin's size, the S&P 500 with the Nasdaq-100 carved out so it is not counted twice, gold above ground, and marketable Treasury bills. Equilibrium is the return those weights imply if the market is already sensible, using a risk aversion of 2.5. Used is the Black-Litterman blend of that equilibrium and the forward view. Inflation is {model.inflation.toFixed(2)}%. Cash is the 3-month bill at {model.rf.toFixed(2)}%.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <Panel title="Return versus bumpiness" kicker="The line is the frontier. Spots on it are the best ratio with no volatility ceiling.">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={model.frontier} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="vol" type="number" domain={[0, Math.ceil(ceiling)]} tickFormatter={(value) => `${value}%`} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                <YAxis dataKey="ret" type="number" tickFormatter={(value) => `${value}%`} tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={48} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [typeof value === "number" ? `${value.toFixed(1)}%` : value, name === "ret" ? "Return" : String(name)]}
                  labelFormatter={(_label, payload) => {
                    const row = payload?.[0]?.payload as { label?: string; vol?: number } | undefined;
                    return row?.label ? row.label : `Volatility ${row?.vol?.toFixed(1) ?? ""}%`;
                  }}
                />
                <ReferenceLine x={cap} stroke="var(--color-warn)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="ret"
                  name="Frontier"
                  stroke="var(--color-up)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--color-up)", stroke: "var(--color-bg)", strokeWidth: 1 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Scatter data={dots} dataKey="ret" name="Asset" fill="var(--color-fg)">
                  <LabelList dataKey="label" position="top" fill="var(--color-muted)" fontSize={11} />
                </Scatter>
                <Scatter data={spots} dataKey="ret" name="Sweet spot" shape={SweetDot}>
                  <LabelList dataKey="label" position="top" fill="var(--color-fg)" fontSize={11} />
                </Scatter>
                <Scatter data={[{ ...chosen, label: "Your mix" }]} dataKey="ret" name="Your mix" fill="var(--color-down)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-muted">
            The green line is the corrected frontier: the highest blended return at each level of shrunk bumpiness, with no holding above {model.weightCap.toFixed(0)}%. The labeled spots ignore the volatility slider. They are the best Sharpe, Sortino, and Calmar on that capped line. The red dot is the mix inside your ceiling. The dashed line is that ceiling.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {spots.map((spot) => (
              <div key={spot.label} className="rounded-lg border border-line px-3 py-2">
                <p className="text-xs text-muted">{spot.label}</p>
                <p className="font-mono text-sm tabular-nums">{spot.detail}</p>
                <p className="mt-1 text-xs text-muted">{spot.plain}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Weights in the mix" kicker={`Long only, and no holding above ${model.weightCap.toFixed(0)}%.`}>
          <div className="grid gap-3">
            {model.labels.map((label, index) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-mono tabular-nums">{(chosen.weights[index] ?? 0).toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-elevated">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(chosen.weights[index] ?? 0, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            S&P 500 is the SPY fund and Nasdaq-100 is QQQ, so dividends are in the return. Gold is GLD. Short-term Treasuries are BIL, which holds 1–3 month U.S. bills. Bitcoin's weekend moves are folded into the next day the stock market is open.
          </p>
        </Panel>
      </div>

      <Panel title="Each asset on its own" kicker="Same history, held alone.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Asset</th>
                <th className="px-2 py-2 font-medium">Return</th>
                <th className="px-2 py-2 font-medium">Volatility</th>
                <th className="px-2 py-2 font-medium">Sharpe</th>
                <th className="px-2 py-2 font-medium">Sortino</th>
                <th className="px-2 py-2 font-medium">Worst fall</th>
                <th className="px-2 py-2 font-medium">Calmar</th>
              </tr>
            </thead>
            <tbody>
              {model.assets.map((asset, index) => (
                <AssetRow key={model.labels[index]} label={model.labels[index] ?? ""} asset={asset} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">
          Correlation is whether two assets fall on the same days. 1 means they move together, 0 means they ignore each other. Mixing assets that ignore each other is what pulls the curve up and left.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium"> </th>
                {model.labels.map((label) => (
                  <th key={label} className="px-2 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.corr.map((row, index) => (
                <tr key={model.labels[index]} className="border-t border-line">
                  <td className="py-2 pr-3">{model.labels[index]}</td>
                  {row.map((value, column) => (
                    <td key={model.labels[column]} className="px-2 py-2 font-mono tabular-nums">{value.toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="When this is useful" kicker="A map of the past, not a promise.">
          <ul className="grid list-disc gap-2 pl-4 text-sm text-muted">
            <li>The assets do not all crash on the same days, so a mix really is calmer than the jumpiest piece.</li>
            <li>The next year looks roughly like the sample: similar rates, no brand-new kind of market.</li>
            <li>You can rebalance. The worst-fall number assumes the weights are put back every day.</li>
            <li>You only want long positions in things a person can actually hold: a stock fund, a gold fund, bills, and bitcoin.</li>
          </ul>
        </Panel>
        <Panel title="When it misleads" kicker="The curve is fit to the same history it brags about.">
          <ul className="grid list-disc gap-2 pl-4 text-sm text-muted">
            <li>A regime change. A rate shock or a crypto winter makes the old "best" mix the last winner, not the next one.</li>
            <li>Average returns from a hot streak are noisy. This curve throws those averages out, but the forward view can still be wrong: real growth is fixed at 2%, multiples are assumed not to change, gold's real return is set to zero, and bitcoin has no valuation anchor.</li>
            <li>Volatility understates crashes. Bitcoin's worst fall in this sample is much larger than its yearly bumpiness suggests.</li>
            <li>It ignores fees, taxes, and the fact you will not rebalance every afternoon. Very low ceilings just hold bills and earn the cash rate.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function sweetSpots(frontier: MixPoint[]): Array<MixPoint & { label: string; color: string; detail: string; plain: string }> {
  const specs = [
    {
      key: "sharpe" as const,
      label: "Max Sharpe",
      color: "var(--color-up)",
      plain: "Most extra return over cash for each unit of bumpiness.",
      detail: (point: MixPoint) => `Sharpe ${point.sharpe.toFixed(2)} · ${fmtPct(point.ret)} at ${point.vol.toFixed(1)}% vol`,
    },
    {
      key: "sortino" as const,
      label: "Max Sortino",
      color: "var(--color-chart-3)",
      plain: "Same idea as Sharpe, but only the losing days count against it.",
      detail: (point: MixPoint) => `Sortino ${point.sortino.toFixed(2)} · ${fmtPct(point.ret)} at ${point.vol.toFixed(1)}% vol`,
    },
    {
      key: "calmar" as const,
      label: "Max Calmar",
      color: "var(--color-warn)",
      plain: "Most yearly return per unit of the worst peak-to-trough fall. A tiny fall can win this even when the gain is small.",
      detail: (point: MixPoint) => `Calmar ${point.calmar == null ? "—" : point.calmar.toFixed(2)} · ${fmtPct(point.ret)} at ${point.vol.toFixed(1)}% vol`,
    },
  ];
  const grouped = new Map<string, MixPoint & { label: string; color: string; detail: string; plain: string }>();
  for (const spec of specs) {
    const point = frontier.reduce<MixPoint | null>((best, row) => {
      const value = row[spec.key];
      if (value == null) return best;
      if (!best) return row;
      const bestValue = best[spec.key];
      return bestValue == null || value > bestValue ? row : best;
    }, null);
    if (!point) continue;
    const id = `${point.vol}-${point.ret}`;
    const existing = grouped.get(id);
    if (existing) {
      existing.label = `${existing.label} and ${spec.label.replace("Max ", "")}`;
      existing.detail = `${existing.detail}. ${spec.detail(point)}`;
    } else {
      grouped.set(id, { ...point, label: spec.label, color: spec.color, detail: spec.detail(point), plain: spec.plain });
    }
  }
  return [...grouped.values()];
}

function SweetDot(props: unknown) {
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: { color?: string } };
  if (cx == null || cy == null) return <g />;
  return <circle cx={cx} cy={cy} r={7} fill={payload?.color ?? "var(--color-warn)"} stroke="var(--color-bg)" strokeWidth={2} />;
}

function AssetRow({ label, asset }: { label: string; asset: MixPoint }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3">{label}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{fmtPct(asset.ret)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{asset.vol.toFixed(1)}%</td>
      <td className="px-2 py-2 font-mono tabular-nums">{asset.sharpe.toFixed(2)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{asset.sortino.toFixed(2)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{fmtPct(asset.maxDrawdown)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{asset.calmar == null ? "—" : asset.calmar.toFixed(2)}</td>
    </tr>
  );
}

function Stat({ label, value, plain }: { label: string; value: string; plain: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-lg tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{plain}</p>
    </div>
  );
}

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}
