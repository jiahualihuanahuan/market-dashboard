import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarDays,
  EyeOff,
  Landmark,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  PieChart,
  HandCoins,
  Scale,
  ShieldAlert,
  Siren,
  Settings,
  Sigma,
  Spline,
  Users,
  Waypoints,
} from "lucide-react";
import { getBoard, getFedWatch, getSmartMoney } from "@/lib/market/board.functions";
import { useDesk } from "@/lib/market/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTIONS, type SectionId, type TabId } from "@/lib/market/tabs";
import { Overview } from "@/components/dashboard/overview";
import { Panic } from "@/components/dashboard/panic";
import { Yields } from "@/components/dashboard/yields";
import { Commodities } from "@/components/dashboard/commodities";
import { HeatmapTab } from "@/components/dashboard/heatmap";
import { ValuationTab } from "@/components/dashboard/valuation";
import { StabilityTab } from "@/components/dashboard/stability";
import { FrontierTab } from "@/components/dashboard/frontier";
import { IncomeTab } from "@/components/dashboard/income";
import { FlowsTab } from "@/components/dashboard/flows";
import { OptionsTab } from "@/components/dashboard/options";
import { DarkTab } from "@/components/dashboard/dark";
import { InsidersTab } from "@/components/dashboard/insiders";
import { Smart } from "@/components/dashboard/smart";
import { Sectors } from "@/components/dashboard/sectors";
import { Macro } from "@/components/dashboard/macro";
import { SettingsPanel } from "@/components/dashboard/settings-panel";
import { LookthruApp } from "@/components/lookthru/app";

const NAV: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "markets", label: "Markets", icon: LayoutDashboard },
  { id: "risk", label: "Risk", icon: ShieldAlert },
  { id: "money", label: "Money flow", icon: Landmark },
  { id: "portfolio", label: "Portfolio", icon: Waypoints },
  { id: "settings", label: "Settings", icon: Settings },
];

const SECTION_INFO: Record<SectionId, { label: string; icon: typeof LayoutDashboard; board?: boolean }> = {
  overview: { label: "Overview", icon: LayoutDashboard, board: true },
  heatmap: { label: "Heatmap", icon: LayoutGrid },
  sectors: { label: "Sectors", icon: PieChart, board: true },
  commodities: { label: "Commodities", icon: Layers, board: true },
  panic: { label: "Panic", icon: Siren, board: true },
  stability: { label: "Stability", icon: ShieldAlert },
  yields: { label: "Yield curve and the Fed", icon: LineChart, board: true },
  macro: { label: "Macro", icon: CalendarDays, board: true },
  insiders: { label: "Insiders", icon: Users },
  smart: { label: "Smart money (13F)", icon: Landmark },
  flows: { label: "ETF flows", icon: ArrowLeftRight },
  dark: { label: "Dark pool", icon: EyeOff },
  options: { label: "Options", icon: Sigma },
  lookthru: { label: "Lookthru", icon: Waypoints },
  income: { label: "Income ETFs", icon: HandCoins },
  frontier: { label: "Frontier", icon: Spline },
  valuation: { label: "Valuation", icon: Scale },
  settings: { label: "Zones and thresholds", icon: Settings },
};

export function Desk() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);
  const sections = SECTIONS[search.tab] as readonly SectionId[];
  // First section open by default; a bookmarked section opens too. Closed sections never mount, so they never fetch.
  const [open, setOpen] = useState<Set<SectionId>>(() => new Set([sections[0]!, ...(search.section ? [search.section] : [])]));
  useEffect(() => {
    setOpen(new Set([sections[0]!, ...(search.section ? [search.section] : [])]));
  }, [search.tab, search.section, sections]);
  const needsBoard = sections.some((id) => open.has(id) && SECTION_INFO[id].board);
  const board = useQuery({
    queryKey: ["market-board"],
    queryFn: () => getBoard({ data: { fresh: false, live: true } }),
    staleTime: 50_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: needsBoard,
  });

  useEffect(() => {
    void useDesk.persist.rehydrate();
    setReady(true);
  }, []);

  const data = board.data;
  const active = NAV.find((item) => item.id === search.tab) ?? NAV[0];

  const render = (id: SectionId) => {
    switch (id) {
      case "overview": return data ? <Overview board={data} /> : null;
      case "panic": return data ? <Panic board={data} /> : null;
      case "yields": return data ? <Yields board={data} /> : null;
      case "commodities": return data ? <Commodities board={data} /> : null;
      case "sectors": return data ? <Sectors board={data} /> : null;
      case "macro": return data ? <Macro board={data} /> : null;
      case "heatmap": return <HeatmapTab />;
      case "valuation": return <ValuationTab />;
      case "stability": return <StabilityTab />;
      case "income": return <IncomeTab />;
      case "frontier": return <FrontierTab />;
      case "flows": return <FlowsTab />;
      case "options": return <OptionsTab />;
      case "dark": return <DarkTab />;
      case "smart": return <Smart />;
      case "insiders": return <InsidersTab />;
      case "lookthru": return <LookthruApp />;
      case "settings": return ready ? <SettingsPanel /> : <p className="text-sm text-muted">Reading saved zones.</p>;
    }
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <p className="font-mono text-xs text-muted">{data?.live ? "Latest trade" : "Through the close"}</p>
            <h1 className="text-xl font-medium tracking-tight">Market Desk</h1>
            <p className="text-sm text-muted">
              {data?.live
                ? `As of ${new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" })}`
                : data
                  ? `Last completed session ${data.asOf}`
                  : "Pulling closes"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="line"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  if (open.has("smart")) client.setQueryData(["smart-money"], await getSmartMoney({ data: { fresh: true } }));
                  window.dispatchEvent(new Event("desk-refresh"));
                  if (needsBoard) client.setQueryData(["market-board"], await getBoard({ data: { fresh: true, live: true } }));
                  if (open.has("yields")) client.setQueryData(["fedwatch"], await getFedWatch({ data: { fresh: true } }));
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
                onClick={() => navigate({ search: (prev) => ({ ...prev, tab: item.id, section: "" }) })}
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
          <div className="grid gap-3">
            {sections.map((id) => {
              const info = SECTION_INFO[id];
              const Icon = info.icon;
              const isOpen = open.has(id);
              if (sections.length === 1) return <div key={id}>{render(id)}</div>;
              return (
                <section key={id} className="rounded-xl border border-line">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    className="flex h-11 w-full items-center gap-2 px-4 text-left text-sm font-medium hover:bg-surface"
                  >
                    <Icon className="size-4 text-muted" aria-hidden="true" />
                    <span className="flex-1">{info.label}</span>
                    <span className="font-mono text-xs text-muted">{isOpen ? "hide" : "show"}</span>
                  </button>
                  {isOpen ? <div className="border-t border-line p-4">{render(id)}</div> : null}
                </section>
              );
            })}
          </div>
          <p className="mt-8 max-w-2xl text-xs text-muted">
            {data?.live
              ? "Prices are the latest trade on the public feed, not the official close. No orders leave this page."
              : "Closes, not a live tape. No orders leave this page. Zones and thresholds stay on this device."}
          </p>
        </main>
      </div>
    </div>
  );
}
