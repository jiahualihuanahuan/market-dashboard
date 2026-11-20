/** Five top-level tabs. Each holds a few sections; the first one opens by default, the rest load when opened. */
export const TABS = ["markets", "risk", "money", "portfolio", "settings"] as const;
export type TabId = (typeof TABS)[number];

export const SECTIONS = {
  markets: ["overview", "heatmap", "sectors", "commodities"],
  risk: ["panic", "stability", "yields", "macro"],
  money: ["insiders", "smart", "flows", "dark", "options"],
  portfolio: ["lookthru", "frontier", "valuation"],
  settings: ["settings"],
} as const satisfies Record<TabId, readonly string[]>;

export type SectionId = (typeof SECTIONS)[TabId][number];

export function isTab(value: unknown): value is TabId {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

export function tabOfSection(value: unknown): TabId | null {
  if (typeof value !== "string") return null;
  for (const tab of TABS) if ((SECTIONS[tab] as readonly string[]).includes(value)) return tab;
  return null;
}

/** Accepts new tab ids and the old 16 tab ids (bookmarks), returning the tab and the section to open. */
export function resolveTab(tab: unknown, section: unknown): { tab: TabId; section: SectionId | "" } {
  if (isTab(tab)) {
    const s = typeof section === "string" && (SECTIONS[tab] as readonly string[]).includes(section) ? (section as SectionId) : "";
    return { tab, section: s };
  }
  const parent = tabOfSection(tab);
  if (parent) return { tab: parent, section: tab as SectionId };
  return { tab: "markets", section: "" };
}
