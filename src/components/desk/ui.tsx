import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/desk/types";

export function Card({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-4", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        {note ? <p className="font-mono text-xs text-subtle">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export const toneText: Record<Tone, string> = { calm: "text-up", caution: "text-warn", alarm: "text-down", unknown: "text-subtle" };
export const toneDot: Record<Tone, string> = { calm: "bg-up", caution: "bg-warn", alarm: "bg-down", unknown: "bg-subtle" };

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-label={tone} className={cn("inline-block size-2 shrink-0 rounded-full", toneDot[tone])} />;
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

export function Pct({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  const cls = value == null || Math.abs(value) < 0.0005 ? "text-muted" : value > 0 ? "text-up" : "text-down";
  return <span className={cn("font-mono tabular-nums", cls)}>{pct(value, digits)}</span>;
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - ((v - min) / span) * 20}`).join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "var(--color-up)" : "var(--color-down)"} strokeWidth="1.5" />
    </svg>
  );
}
