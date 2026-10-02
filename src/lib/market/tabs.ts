export const TABS = [
  "overview",
  "macro",
  "yields",
  "commodities",
  "heatmap",
  "technical",
  "valuation",
  "frontier",
  "flows",
  "options",
  "dark",
  "smart",
  "insiders",
  "sectors",
  "lookthru",
  "settings",
] as const;

export type TabId = (typeof TABS)[number];

export function isTab(value: unknown): value is TabId {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}
