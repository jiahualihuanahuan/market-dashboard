import { createServerFn } from "@tanstack/react-start";

export const getDesk = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({
    fresh: typeof input === "object" && input !== null && (input as { fresh?: unknown }).fresh === true,
  }))
  .handler(async ({ data }) => {
    const { loadDesk } = await import("./desk.server");
    return loadDesk(data.fresh);
  });
