import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DeskPage } from "@/components/desk/desk-page";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "income" ? ("income" as const) : ("desk" as const),
  }),
  component: Home,
});

function Home() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  return <DeskPage tab={tab} onTab={(next) => navigate({ search: { tab: next } })} />;
}
