import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "@/components/dashboard/desk";
import { resolveTab } from "@/lib/market/tabs";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...resolveTab(search.tab, search.section),
    symbol: typeof search.symbol === "string" ? search.symbol : "",
  }),
  component: Desk,
});
