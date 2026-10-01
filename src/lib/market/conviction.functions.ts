import { createServerFn } from "@tanstack/react-start";
import { TECH_UNIVERSE } from "./conviction";

export const getConviction = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = typeof input === "object" && input && "ticker" in input ? String((input as { ticker?: string }).ticker ?? "") : "";
    const ticker = raw.trim().toUpperCase();
    if (!TECH_UNIVERSE.some((row) => row.ticker === ticker)) throw new Error("Pick a name on the list.");
    const fresh = typeof input === "object" && input !== null && "fresh" in input && (input as { fresh?: boolean }).fresh === true;
    return { ticker, fresh };
  })
  .handler(async ({ data }) => {
    const { buildConviction } = await import("./conviction.server");
    return buildConviction(data.ticker, data.fresh);
  });
