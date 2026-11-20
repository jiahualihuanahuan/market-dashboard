import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/market/format";

export function Panel({
  title,
  kicker,
  action,
  children,
  className,
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-4", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {kicker ? <p className="font-mono text-xs text-muted">{kicker}</p> : null}
          <h2 className="text-sm font-medium tracking-tight text-fg">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tone({ value, className }: { value: number | null | undefined; className?: string }) {
  const tone = value == null || Math.abs(value) < 0.005 ? "text-muted" : value > 0 ? "text-up" : "text-down";
  return <span className={cn("font-mono tabular-nums", tone, className)}>{fmtPct(value)}</span>;
}

export function Heat({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="font-mono text-subtle">—</span>;
  }
  const mix = Math.round(Math.min(Math.abs(value) / 8, 1) * 48);
  const ink = value >= 0 ? "var(--color-up)" : "var(--color-down)";
  return (
    <span
      className="inline-flex min-w-16 justify-end rounded-sm px-2 py-1 font-mono text-xs tabular-nums text-fg"
      style={{ background: `color-mix(in oklab, ${ink} ${mix}%, var(--color-surface))` }}
    >
      {fmtPct(value)}
    </span>
  );
}

export function Gauge({ value, caption }: { value: number; caption: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 52;
  const length = Math.PI * r;
  const dash = (v / 100) * length;
  const stroke = v < 40 ? "var(--color-down)" : v > 60 ? "var(--color-up)" : "var(--color-muted)";
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 86" className="h-20 w-32 shrink-0" aria-hidden="true">
        <path d="M16 72 A 54 54 0 0 1 124 72" fill="none" stroke="var(--color-line)" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M16 72 A 54 54 0 0 1 124 72"
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${length}`}
        />
        <text x="70" y="68" textAnchor="middle" fill="var(--color-fg)" fontSize="22" fontFamily="var(--font-mono)">
          {Math.round(v)}
        </text>
      </svg>
      <div>
        <p className="font-mono text-xs text-muted">0 fear / 100 greed</p>
        <p className="text-lg font-medium tracking-tight">{caption}</p>
      </div>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-lg text-sm text-muted">{body}</p>
    </div>
  );
}

export const tooltipStyle = {
  contentStyle: {
    background: "var(--color-elevated)",
    border: "1px solid var(--color-line)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--color-muted)" },
  itemStyle: { color: "var(--color-fg)" },
};
