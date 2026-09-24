import { createFileRoute } from "@tanstack/react-router";

/** Liveness probe for Docker and the in-container watchdog. No market calls. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            ok: true,
            service: "market-desk",
            time: new Date().toISOString(),
          },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
