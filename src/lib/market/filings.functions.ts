import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_WATCH, type WatchName } from "./filings";

function watchOf(input: unknown): WatchName[] {
  if (typeof input !== "object" || !input || !("watch" in input) || !Array.isArray((input as { watch?: unknown }).watch)) {
    return DEFAULT_WATCH;
  }
  return (input as { watch: unknown[] }).watch
    .map((row) => {
      const item = typeof row === "object" && row ? (row as Record<string, unknown>) : {};
      const ticker = String(item.ticker ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return null;
      const market = item.market === "CA" ? "CA" : "US";
      const irRss = typeof item.irRss === "string" ? item.irRss.trim() : "";
      return {
        ticker,
        name: String(item.name ?? ticker).slice(0, 80),
        market,
        irRss: irRss.startsWith("https://") ? irRss : undefined,
      } satisfies WatchName;
    })
    .filter((row): row is WatchName => row != null)
    .slice(0, 25);
}

export const getFilings = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const days = typeof input === "object" && input && "days" in input ? Number((input as { days?: number }).days) : 7;
    const fresh = typeof input === "object" && input !== null && "fresh" in input && (input as { fresh?: boolean }).fresh === true;
    const host = typeof input === "object" && input && "host" in input ? String((input as { host?: string }).host ?? "") : "";
    const model = typeof input === "object" && input && "model" in input ? String((input as { model?: string }).model ?? "") : "";
    if (host && !/^https?:\/\/[A-Za-z0-9.:-]+(?::\d+)?(?:\/v1)?$/.test(host.trim())) throw new Error("Use a host like http://192.168.86.35:11434");
    return { watch: watchOf(input), days: Number.isFinite(days) ? Math.max(1, Math.min(30, days)) : 7, fresh, host: host.trim(), model: model.trim() };
  })
  .handler(async ({ data }) => {
    const { buildFilingsDigest } = await import("./filings.server");
    return buildFilingsDigest(data);
  });
