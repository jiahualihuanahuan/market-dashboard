import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SAMPLE_POSITIONS } from "./catalog";
import { normalizeTicker } from "./tickers";
import type { CurrencyCode, Position } from "./types";

type PortfolioState = {
  hydrated: boolean;
  positions: Position[];
  currency: CurrencyCode;
  setHydrated: () => void;
  setCurrency: (c: CurrencyCode) => void;
  addPosition: (ticker: string, shares: number) => void;
  addMany: (rows: { ticker: string; shares: number }[]) => void;
  updateShares: (id: string, shares: number) => void;
  removePosition: (id: string) => void;
  loadSample: () => void;
  clear: () => void;
};

function nid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPositions(rows: { ticker: string; shares: number }[]): Position[] {
  return rows.map((r) => ({
    id: nid(),
    ticker: normalizeTicker(r.ticker),
    shares: r.shares,
  }));
}

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      positions: toPositions(SAMPLE_POSITIONS),
      currency: "CAD",
      setHydrated: () => set({ hydrated: true }),
      setCurrency: (currency) => set({ currency }),
      addPosition: (ticker, shares) => {
        const t = normalizeTicker(ticker);
        if (!t || !Number.isFinite(shares) || shares === 0) return;
        const existing = get().positions.find((p) => p.ticker === t);
        if (existing) {
          set({
            positions: get().positions.map((p) =>
              p.id === existing.id ? { ...p, shares: p.shares + shares } : p,
            ),
          });
          return;
        }
        set({ positions: [...get().positions, { id: nid(), ticker: t, shares }] });
      },
      addMany: (rows) => {
        for (const row of rows) get().addPosition(row.ticker, row.shares);
      },
      updateShares: (id, shares) => {
        if (!Number.isFinite(shares) || shares <= 0) return;
        set({
          positions: get().positions.map((p) => (p.id === id ? { ...p, shares } : p)),
        });
      },
      removePosition: (id) =>
        set({ positions: get().positions.filter((p) => p.id !== id) }),
      loadSample: () => set({ positions: toPositions(SAMPLE_POSITIONS) }),
      clear: () => set({ positions: [] }),
    }),
    {
      name: "lookthru-book-v4",
      partialize: (s) => ({ positions: s.positions, currency: s.currency }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
