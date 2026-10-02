export const TABS = [
  "overview",
  "macro",
  "yields",
  "commodities",
  "heatmap",
  "frontier",
  "flows",
  "options",
  "dark",
  "valuation",
  "radar",
  "panic",
  "smart",
  "sectors",
  "lookthru",
  "conviction",
  "filings",
  "settings",
] as const;

export type TabId = (typeof TABS)[number];

export function isTab(value: unknown): value is TabId {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}
