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
    queryKey: ["frontier"],
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

  return (
    <div className="grid gap-4">
      <Panel
        title="Mix inside a bumpiness limit"
        kicker={`${model.start} to ${model.end} · ${model.days} stock-market days`}
      >
        <p className="max-w-3xl text-sm text-muted">
          The curve is the efficient frontier: the mixes that earned the most, in this history, for each amount of yearly bumpiness. Bumpiness here is volatility, the annualized standard deviation of daily moves. The slider is a ceiling. The desk then picks the highest past return that still stays under it.
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
          <Stat label="Expected return" value={fmtPct(chosen.ret)} plain="Average yearly gain in this sample. Not a forecast." />
          <Stat label="Volatility" value={`${chosen.vol.toFixed(1)}%`} plain="How wide the yearly result typically swings." />
          <Stat label="Sharpe" value={chosen.sharpe.toFixed(2)} plain="Extra return over cash, per unit of bumpiness. Higher is more comfortable reward." />
          <Stat label="Sortino" value={chosen.sortino.toFixed(2)} plain="Like Sharpe, but only the down days count. Upside does not get punished." />
          <Stat label="Worst fall" value={fmtPct(chosen.maxDrawdown)} plain="Largest peak-to-trough drop if you had held this mix and rebalanced every day." />
          <Stat label="Calmar" value={chosen.calmar == null ? "—" : chosen.calmar.toFixed(2)} plain="Yearly return divided by that worst fall. Higher means the crashes were smaller relative to the gain." />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <Panel title="Return versus bumpiness" kicker="Curve is the frontier. Dots are the five assets alone.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
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
                <Line data={model.frontier} dataKey="ret" name="Frontier" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
                <Scatter data={dots} dataKey="ret" name="Asset" fill="var(--color-fg)">
                  <LabelList dataKey="label" position="top" fill="var(--color-muted)" fontSize={11} />
                </Scatter>
                <Scatter data={[{ ...chosen, label: "Your mix" }]} dataKey="ret" name="Your mix" fill="var(--color-warn)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-muted">
            The dashed line is your volatility ceiling. Cash in the Sharpe ratio is the short-term Treasury fund's own return, {model.rf.toFixed(1)}% a year, so that fund's Sharpe is about zero.
          </p>
        </Panel>
        <Panel title="Weights in the mix" kicker="Long only. They add up to 100%.">
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
            <li>Average returns are noisy. Shift the window a year and the weights move. The curve overfits.</li>
            <li>Volatility understates crashes. Bitcoin's worst fall in this sample is much larger than its yearly bumpiness suggests.</li>
            <li>It ignores fees, taxes, and the fact you will not rebalance every afternoon. Very low ceilings just hold bills and earn the cash rate.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
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
