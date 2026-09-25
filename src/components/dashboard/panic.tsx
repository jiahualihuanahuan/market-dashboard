import type { Board } from "@/lib/market/types";
import { panicCall } from "@/lib/market/rules";
import { useDesk } from "@/lib/market/settings";
import { Panel } from "@/components/dashboard/bits";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function Panic({ board }: { board: Board }) {
  const partialVix = useDesk((s) => s.partialVix);
  const fullVix = useDesk((s) => s.fullVix);
  const partialPct = useDesk((s) => s.partialPct);
  const breadthPanic = useDesk((s) => s.breadthPanic);
  const setPanic = useDesk((s) => s.setPanic);
  const vix = board.quotes.find((quote) => quote.symbol === "^VIX")?.price ?? null;
  const book = board.breadth.source === "spx" ? "S&P 500" : "tracked book";
  const decliners = board.breadth.universe ? (board.breadth.down / board.breadth.universe) * 100 : null;
  const call = panicCall({ vix, declinersPct: decliners, partialVix, fullVix, partialPct, breadthPanic, book });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Panel title={call.title} kicker="Idle cash only">
        <p className={cn("font-mono text-xs", call.level === "full" || call.level === "partial" ? "text-warn" : "text-muted")}>
          {call.level === "standby" ? "No trigger" : call.level === "unconfirmed" ? "Not confirmed" : call.level}
        </p>
        <p className="mt-3 max-w-xl text-sm text-muted">{call.detail}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Meter label="VIX close" value={vix} max={80} mark={partialVix} />
          <Meter label="Decliners" value={decliners} max={100} mark={breadthPanic} suffix="%" />
        </div>
        <ul className="mt-6 grid gap-2 text-sm text-muted">
          <li>Two years of living expenses stay in Treasuries, which are US government bonds. This screen never touches that pile. Idle cash is only the money you could invest and have not.</li>
          <li>VIX is the price of 30-day insurance on the S&P 500. A high number means traders are paying up to be protected. Decliners are the share of index members that closed down.</li>
          <li>Idle cash deploys in two steps: {partialPct}% when VIX clears {partialVix}, the rest when it clears {fullVix}.</li>
          <li>Both steps also need at least {breadthPanic}% of the {book} down on the day. A volatility spike without a broad flush is not the trade.</li>
          <li>Cash has an opportunity cost. The point of the rule is to spend it when prices already discount a scare, not to admire a high VIX.</li>
        </ul>
      </Panel>
      <Panel title="Thresholds" kicker="Saved on this device">
        <div className="grid gap-3">
          <Num label="Partial VIX" value={partialVix} onChange={(value) => setPanic({ partialVix: value })} />
          <Num label="Full VIX" value={fullVix} onChange={(value) => setPanic({ fullVix: value })} />
          <Num label="Partial deploy %" value={partialPct} onChange={(value) => setPanic({ partialPct: value })} />
          <Num label="Decliners bar %" value={breadthPanic} onChange={(value) => setPanic({ breadthPanic: value })} />
        </div>
      </Panel>
    </div>
  );
}

function Meter({ label, value, max, mark, suffix = "" }: { label: string; value: number | null; max: number; mark: number; suffix?: string }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const markLeft = Math.max(0, Math.min(100, (mark / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono text-fg">{value == null ? "—" : `${value.toFixed(1)}${suffix}`}</span>
      </div>
      <div className="relative h-3 rounded-full bg-elevated">
        <div className="h-3 rounded-full bg-fg/80" style={{ width: `${width}%` }} />
        <div className="absolute top-0 h-3 w-px bg-warn" style={{ left: `${markLeft}%` }} />
      </div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs text-muted">
      {label}
      <Input
        className="mt-1"
        inputMode="decimal"
        value={String(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}
