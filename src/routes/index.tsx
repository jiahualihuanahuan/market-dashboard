import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "@/components/dashboard/desk";
import { isTab } from "@/lib/market/tabs";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: isTab(search.tab) ? search.tab : "overview",
    symbol: typeof search.symbol === "string" ? search.symbol : "",
  }),
  component: Desk,
});
