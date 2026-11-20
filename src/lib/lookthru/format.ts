import type { CurrencyCode } from "./types.ts";

function money(currency: string, exact: boolean): Intl.NumberFormat {
  const code = currency === "CAD" || currency === "USD" ? currency : currency || "USD";
  return new Intl.NumberFormat(code === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: exact ? 2 : 0,
    maximumFractionDigits: exact ? 2 : 0,
  });
}

export function formatMoney(value: number, currency: string, exact = false): string {
  const abs = Math.abs(value);
  const useExact = exact || abs < 1000;
  try {
    return money(currency, useExact).format(value);
  } catch {
    return `${value.toFixed(useExact ? 2 : 0)} ${currency}`;
  }
}

export function formatPct(weight: number, digits = 1): string {
  const pct = weight * 100;
  return `${pct.toFixed(digits)}%`;
}

export function formatChange(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatShares(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toLocaleString("en-CA", { maximumFractionDigits: 2 });
}

export function convert(
  amount: number,
  from: string,
  to: CurrencyCode,
  usdCad: number,
): number {
  const src = from.toUpperCase();
  if (src === to) return amount;
  const rate = usdCad > 0 && usdCad < 1 ? 1 / usdCad : usdCad || 1.39;
  const inUsd = src === "USD" ? amount : src === "CAD" ? amount / rate : amount;
  return to === "USD" ? inUsd : inUsd * rate;
}
