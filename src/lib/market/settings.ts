import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Zone = {
  symbol: string;
  low: number;
  high: number;
  skipAbove: number;
  note: string;
};

type DeskState = {
  zones: Zone[];
  watch: string[];
  partialVix: number;
  fullVix: number;
  partialPct: number;
  breadthPanic: number;
  upsertZone: (zone: Zone) => void;
  removeZone: (symbol: string) => void;
  toggleWatch: (symbol: string) => void;
  setPanic: (patch: Partial<Pick<DeskState, "partialVix" | "fullVix" | "partialPct" | "breadthPanic">>) => void;
};

export const DEFAULT_ZONES: Zone[] = [
  { symbol: "COST", low: 860, high: 920, skipAbove: 980, note: "Around 900" },
  { symbol: "GOOGL", low: 300, high: 330, skipAbove: 350, note: "350 and above is a skip" },
  { symbol: "NVDA", low: 170, high: 200, skipAbove: 240, note: "170 to 200" },
  { symbol: "SPY", low: 500, high: 560, skipAbove: 650, note: "Broad add, not a target" },
];

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
      zones: DEFAULT_ZONES,
      watch: ["COST", "GOOGL", "NVDA", "SPY", "QQQ", "IWM"],
      partialVix: 45,
      fullVix: 50,
      partialPct: 30,
      breadthPanic: 80,
      upsertZone: (zone) =>
        set((state) => {
          const symbol = zone.symbol.toUpperCase();
          const next = { ...zone, symbol };
          const zones = state.zones.some((item) => item.symbol === symbol)
            ? state.zones.map((item) => (item.symbol === symbol ? next : item))
            : [...state.zones, next];
          const watch = state.watch.includes(symbol) ? state.watch : [...state.watch, symbol];
          return { zones, watch };
        }),
      removeZone: (symbol) =>
        set((state) => ({ zones: state.zones.filter((zone) => zone.symbol !== symbol) })),
      toggleWatch: (symbol) =>
        set((state) => ({
          watch: state.watch.includes(symbol)
            ? state.watch.filter((item) => item !== symbol)
            : [...state.watch, symbol],
        })),
      setPanic: (patch) => set(patch),
    }),
    { name: "market-desk", skipHydration: true },
  ),
);
