export const TABS = [
  "overview",
  "yields",
  "commodities",
  "heatmap",
  "frontier",
  "flows",
  "options",
  "valuation",
  "radar",
  "panic",
  "smart",
  "sectors",
  "macro",
  "lookthru",
  "settings",
] as const;

export type TabId = (typeof TABS)[number];

export function isTab(value: unknown): value is TabId {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}
