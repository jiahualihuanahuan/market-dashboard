import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  tickers: z.array(z.string().min(1).max(40)).min(1).max(120),
  live: z.boolean().optional(),
});

export const analyzeHoldings = createServerFn({ method: "POST" })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { analyzeTickers } = await import("./yahoo.server");
    return analyzeTickers(data.tickers, data.live === true);
  });
