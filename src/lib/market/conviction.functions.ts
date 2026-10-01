import { createServerFn } from "@tanstack/react-start";
import { TECH_UNIVERSE } from "./conviction";

function endpoint(input: unknown): { host: string; model: string } {
  const host = typeof input === "object" && input && "host" in input ? String((input as { host?: string }).host ?? "") : "";
  const model = typeof input === "object" && input && "model" in input ? String((input as { model?: string }).model ?? "") : "";
  if (host && !/^https?:\/\/[A-Za-z0-9.:-]+(?::\d+)?(?:\/v1)?$/.test(host.trim())) throw new Error("Use a host like http://192.168.86.35:11434");
  return { host: host.trim(), model: model.trim() };
}

export const getOllama = createServerFn({ method: "POST" })
  .validator(endpoint)
  .handler(async ({ data }) => {
    const { listModels } = await import("./conviction.server");
    return listModels(data.host);
  });


export const getNews = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = typeof input === "object" && input && "ticker" in input ? String((input as { ticker?: string }).ticker ?? "") : "";
    const ticker = raw.trim().toUpperCase();
    if (!TECH_UNIVERSE.some((row) => row.ticker === ticker)) throw new Error("Pick a name on the list.");
    return { ticker };
  })
  .handler(async ({ data }) => {
    const { fetchTechNews } = await import("./conviction.server");
    const articles = await fetchTechNews(data.ticker);
    return { ticker: data.ticker, articles, error: articles.length ? null : "No headlines came back from Yahoo or Google News." };
  });

export const getConviction = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = typeof input === "object" && input && "ticker" in input ? String((input as { ticker?: string }).ticker ?? "") : "";
    const ticker = raw.trim().toUpperCase();
    if (!TECH_UNIVERSE.some((row) => row.ticker === ticker)) throw new Error("Pick a name on the list.");
    const fresh = typeof input === "object" && input !== null && "fresh" in input && (input as { fresh?: boolean }).fresh === true;
    return { ticker, fresh, ...endpoint(input) };
  })
  .handler(async ({ data }) => {
    const { buildConviction } = await import("./conviction.server");
    return buildConviction(data.ticker, data.fresh, data.host, data.model);
  });
