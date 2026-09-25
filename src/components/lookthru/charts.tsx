import type { ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/lookthru/format";
import type { LookthroughResult } from "@/lib/lookthru/types";

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

export function CompositionCharts({ result }: { result: LookthroughResult }) {
  const top = result.leaves
    .filter((l) => l.kind === "equity")
    .slice(0, 8)
    .map((l) => ({
      name: l.displaySymbol,
      weight: Math.round(l.weight * 1000) / 10,
      value: l.value,
    }));

  const sectors = result.sectors
    .filter((s) => s.name !== "Cash & leverage" && s.weight > 0)
    .slice(0, 8)
    .map((s) => ({
      name: shortSector(s.name),
      weight: Math.round(s.weight * 1000) / 10,
      value: s.value,
    }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Top underlying stocks" subtitle="Share of portfolio NAV">
        <BarBlock data={top} currency={result.currency} />
      </ChartCard>
      <ChartCard title="Sector mix" subtitle="Look-through, including nested ETFs">
        <BarBlock data={sectors} currency={result.currency} />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface p-4 border border-line sm:p-5">
      <h2 className="font-medium text-xl tracking-tight">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      <div className="mt-3 h-56">{children}</div>
    </section>
  );
}

function BarBlock({
  data,
  currency,
}: {
  data: { name: string; weight: number; value: number }[];
  currency: LookthroughResult["currency"];
}) {
  if (!data.length) {
    return <p className="text-sm text-muted">No composition yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
        <XAxis
          type="number"
          tick={{ fill: "var(--color-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={78}
          tick={{ fill: "var(--color-fg)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--color-elevated)" }}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--color-fg)",
          }}
          formatter={(value, _name, item) => {
            const v = Number(value);
            const row = item?.payload as { value: number };
            return [`${v.toFixed(1)}% · ${formatMoney(row.value, currency)}`, "Weight"];
          }}
        />
        <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={12}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function shortSector(name: string): string {
  return name
    .replace("Information Technology", "Technology")
    .replace("Consumer Discretionary", "Cons. disc.")
    .replace("Consumer Staples", "Staples")
    .replace("Communication Services", "Comm.")
    .replace("Cash & leverage", "Cash");
}
