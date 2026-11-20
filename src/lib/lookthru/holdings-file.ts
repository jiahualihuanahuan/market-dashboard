import { readFileSync, statSync } from "node:fs";
import { holdingsAreUsable } from "./holdings-parse.ts";
import { stripShareClass } from "./tickers.ts";
import type { HoldingLine } from "./types.ts";

/**
 * Optional pre-scraped ETF holdings (covered-call-holdings/scrape.py -> lookthru/holdings.json),
 * kept in the data volume, never in git. Shape:
 *   { "funds": { "HMAX.TO": { "asOf": "2026-10-30", "holdings": [{ symbol, name, weight, sector }] } } }
 * Weights are fractions (0.245 = 24.5%). Re-read whenever the file's mtime changes.
 */
export const DEFAULT_HOLDINGS_FILE = "/data/lookthru/holdings.json";

export type FileFund = { asOf?: string; holdings: HoldingLine[] };

type Loaded = { path: string; mtime: number; funds: Map<string, FileFund> };
let loaded: Loaded | null = null;

function holdingsPath(path?: string): string {
  return path || process.env["LOOKTHRU_HOLDINGS_FILE"] || DEFAULT_HOLDINGS_FILE;
}

export function loadHoldingsFile(path?: string): Map<string, FileFund> {
  const file = holdingsPath(path);
  try {
    const mtime = statSync(file).mtimeMs;
    if (loaded && loaded.path === file && loaded.mtime === mtime) return loaded.funds;
    const json = JSON.parse(readFileSync(file, "utf8")) as { funds?: Record<string, FileFund> };
    const funds = new Map<string, FileFund>();
    for (const [symbol, fund] of Object.entries(json.funds ?? {})) {
      if (!Array.isArray(fund?.holdings) || fund.holdings.length === 0) continue;
      funds.set(symbol.toUpperCase(), fund);
      const base = stripShareClass(symbol);
      if (base && !funds.has(base)) funds.set(base, fund);
    }
    loaded = { path: file, mtime, funds };
    return funds;
  } catch {
    // No file mounted (or unreadable): live issuer adapters only.
    return loaded && loaded.path === file ? loaded.funds : new Map();
  }
}

export function hasFileHoldings(symbol: string, path?: string): boolean {
  const funds = loadHoldingsFile(path);
  return funds.has(symbol.toUpperCase()) || funds.has(stripShareClass(symbol));
}

export function fileHoldings(symbol: string, path?: string): FileFund | null {
  const funds = loadHoldingsFile(path);
  const hit = funds.get(symbol.toUpperCase()) ?? funds.get(stripShareClass(symbol));
  if (!hit || !holdingsAreUsable(hit.holdings)) return null;
  return hit;
}
