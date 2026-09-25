import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Crosshair,
  Landmark,
  Layers,
  LayoutDashboard,
  LineChart,
  PieChart,
  Scale,
  Settings,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { getBoard } from "@/lib/market/board.functions";
import { useDesk } from "@/lib/market/settings";
import { fmtBp, fmtPrice } from "@/lib/market/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TabId } from "@/lib/market/tabs";
import { Overview } from "@/components/dashboard/overview";
import { Yields } from "@/components/dashboard/yields";
import { Commodities } from "@/components/dashboard/commodities";
import { Valuation } from "@/components/dashboard/valuation";
import { Radar } from "@/components/dashboard/radar";
import { Panic } from "@/components/dashboard/panic";
import { Smart } from "@/components/dashboard/smart";
import { Sectors } from "@/components/dashboard/sectors";
import { Macro } from "@/components/dashboard/macro";
import { SettingsPanel } from "@/components/dashboard/settings-panel";
import { LookthruApp } from "@/components/lookthru/app";

const NAV: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "yields", label: "Yield curve", icon: LineChart },
  { id: "commodities", label: "Commodities", icon: Layers },
  { id: "valuation", label: "Valuation", icon: Scale },
  { id: "radar", label: "Opportunity", icon: Crosshair },
  { id: "panic", label: "Panic rules", icon: ShieldAlert },
  { id: "smart", label: "Smart money", icon: Landmark },
  { id: "sectors", label: "Sectors", icon: PieChart },
  { id: "macro", label: "Macro", icon: CalendarDays },
  { id: "lookthru", label: "Lookthru", icon: Waypoints },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Desk() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);
  const board = useQuery({
    queryKey: ["market-board"],
    queryFn: () => getBoard({ data: { fresh: false } }),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    void useDesk.persist.rehydrate();
    setReady(true);
  }, []);

  const needsBoard = search.tab !== "lookthru" && search.tab !== "smart" && search.tab !== "settings";
  const data = board.data;
  const vix = data?.quotes.find((quote) => quote.symbol === "^VIX");
  const active = NAV.find((item) => item.id === search.tab) ?? NAV[0];

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <p className="font-mono text-xs text-muted">Through the close</p>
            <h1 className="text-xl font-medium tracking-tight">Market Desk</h1>
            <p className="text-sm text-muted">
              {data ? `Last completed session ${data.asOf}` : "Pulling closes"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill label="VIX" value={vix ? fmtPrice(vix.price) : "—"} />
            <Pill label="10y–2y" value={data ? fmtBp(data.t10y2y) : "—"} />
            <Button
              variant="line"
              disabled={refreshing || board.isPending}
              onClick={async () => {
                setRefreshing(true);
                try {
                  const next = await getBoard({ data: { fresh: true } });
                  client.setQueryData(["market-board"], next);
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
      </header>
      <div className="md:grid md:grid-cols-[14rem_1fr]">
        <nav className="flex gap-2 overflow-x-auto border-b border-line px-4 py-2 md:block md:border-r md:border-b-0 md:px-3 md:py-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = item.id === search.tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate({ search: (prev) => ({ ...prev, tab: item.id }) })}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm md:w-full",
                  on ? "bg-elevated text-fg" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <main className="min-w-0 px-4 py-4 md:px-6 md:py-6">
          <h2 className="mb-4 text-lg font-medium tracking-tight">{active.label}</h2>
          {needsBoard && board.isPending ? (
            <p className="text-sm text-muted">Pulling closes from the price and rates feeds.</p>
          ) : null}
          {needsBoard && board.isError ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="font-medium">The feeds did not answer</p>
              <p className="mt-1 text-sm text-muted">{board.error instanceof Error ? board.error.message : "Try refresh."}</p>
            </div>
          ) : null}
          {data && search.tab === "overview" ? <Overview board={data} /> : null}
          {data && search.tab === "yields" ? <Yields board={data} /> : null}
          {data && search.tab === "commodities" ? <Commodities board={data} /> : null}
          {data && search.tab === "valuation" ? <Valuation board={data} /> : null}
          {data && search.tab === "radar" ? <Radar board={data} ready={ready} /> : null}
          {data && search.tab === "panic" ? <Panic board={data} /> : null}
          {search.tab === "smart" ? <Smart /> : null}
          {data && search.tab === "sectors" ? <Sectors board={data} /> : null}
          {data && search.tab === "macro" ? <Macro board={data} /> : null}
          {search.tab === "lookthru" ? <LookthruApp /> : null}
          {search.tab === "settings" ? (
            ready ? <SettingsPanel /> : <p className="text-sm text-muted">Reading saved zones.</p>
          ) : null}
          <p className="mt-8 max-w-2xl text-xs text-muted">
            Closes, not a live tape. No orders leave this page. Zones and thresholds stay on this device.
          </p>
        </main>
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-3 font-mono text-xs">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums text-fg">{value}</span>
    </span>
  );
}
