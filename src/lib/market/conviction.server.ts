import { createHash } from "node:crypto";
import { techName, type ConvictionArticle, type ConvictionMemo, type ConvictionPoint } from "./conviction";

const NOISE = /\b(price target|upgraded to|downgraded to|initiates coverage|should you buy|prediction:)\b/i;
const MATERIAL = /\b(earnings|guidance|revenue|margin|capex|buyback|dividend|antitrust|doj|ftc|export control|layoffs|acquisition|acquires|launch|chip|data center|cloud|azure|aws|advertising|regulation|outlook)\b/i;
const DEFAULT_HOST = "http://192.168.86.35:11434";

const cache = new Map<string, { at: number; memo: ConvictionMemo }>();

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : "";
}

function items(xml: string): string[] {
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
}

export function ollamaHost(input?: string): string {
  const raw = (input || process.env.OLLAMA_BASE || DEFAULT_HOST).trim().replace(/\/$/, "");
  return raw.replace(/\/v1$/, "");
}

async function readFeed(url: string, source: string): Promise<ConvictionArticle[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MarketDeskConviction/0.1" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return items(xml)
      .map((item) => {
        const title = tag(item, "title");
        const summary = tag(item, "description").slice(0, 500);
        const urlValue = tag(item, "link");
        if (!title) return null;
        const blob = `${title} ${summary}`;
        const score = (MATERIAL.test(blob) ? 3 : 1) - (NOISE.test(title) ? 2 : 0);
        return {
          id: createHash("sha1").update(`${title}|${urlValue}`).digest("hex").slice(0, 12),
          source,
          title,
          summary,
          url: urlValue,
          publishedAt: tag(item, "pubDate") || null,
          score,
        };
      })
      .filter((row): row is ConvictionArticle & { score: number } => row != null)
      .sort((a, b) => b.score - a.score)
      .map(({ score: _score, ...row }) => row);
  } catch {
    return [];
  }
}

export async function fetchTechNews(ticker: string, limit = 12): Promise<ConvictionArticle[]> {
  const name = techName(ticker);
  const yahoo = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
  const google = `https://news.google.com/rss/search?q=${encodeURIComponent(`${ticker} OR ${name} when:14d`)}&hl=en-US&gl=US&ceid=US:en`;
  const rows = [...(await readFeed(yahoo, "yahoo")), ...(await readFeed(google, "google"))];
  const seen = new Set<string>();
  const unique: ConvictionArticle[] = [];
  for (const row of rows) {
    const key = row.title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

export async function listModels(hostInput?: string): Promise<{ host: string; models: string[]; error: string | null }> {
  const host = ollamaHost(hostInput);
  try {
    const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { host, models: [], error: `Ollama answered ${response.status} at ${host}/api/tags` };
    const body = (await response.json()) as { models?: { name?: string }[] };
    return { host, models: (body.models ?? []).map((row) => row.name ?? "").filter(Boolean), error: null };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "request failed";
    return { host, models: [], error: `Cannot reach Ollama at ${host}. ${detail}` };
  }
}

function prompt(ticker: string, articles: ConvictionArticle[]): string {
  const lines = articles.map((article, index) => `[${index + 1}] ${article.title}\n    ${article.summary}`).join("\n");
  return `Company: ${techName(ticker)} (${ticker})
Today: ${new Date().toISOString().slice(0, 10)}

Headlines:
${lines || "No articles retrieved."}

Return only JSON:
{"conviction":3,"stance":"mixed","whatChanged":"","bullPoints":[{"claim":"","evidence":"[1]","confidence":"medium"}],"bearPoints":[{"claim":"","evidence":"[1]","confidence":"medium"}],"openQuestions":[""],"notInSources":[""]}`;
}

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function points(value: unknown): ConvictionPoint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((row) => {
    const item = typeof row === "object" && row ? (row as Record<string, unknown>) : {};
    const confidence = item.confidence === "high" || item.confidence === "low" ? item.confidence : "medium";
    return {
      claim: String(item.claim ?? ""),
      evidence: String(item.evidence ?? ""),
      confidence,
    };
  }).filter((row) => row.claim);
}

function parseMemo(text: string): Omit<ConvictionMemo, "ticker" | "company" | "articles" | "model" | "generatedAt" | "error"> {
  const cleaned = stripThink(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return JSON.");
  const data = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  const conviction = Number(data.conviction);
  const stance = data.stance === "constructive" || data.stance === "cautious" ? data.stance : "mixed";
  return {
    conviction: Number.isFinite(conviction) ? Math.max(1, Math.min(5, Math.round(conviction))) : null,
    stance,
    whatChanged: String(data.whatChanged ?? data.what_changed ?? ""),
    bullPoints: points(data.bullPoints ?? data.bull_points),
    bearPoints: points(data.bearPoints ?? data.bear_points),
    openQuestions: Array.isArray(data.openQuestions ?? data.open_questions) ? (data.openQuestions ?? data.open_questions as unknown[]).map(String).slice(0, 4) : [],
    notInSources: Array.isArray(data.notInSources ?? data.not_in_sources) ? (data.notInSources ?? data.not_in_sources as unknown[]).map(String).slice(0, 4) : [],
  };
}

async function complete(host: string, model: string, messages: { role: string; content: string }[]): Promise<string> {
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, think: false, messages, options: { temperature: 0.2 } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Ollama ${response.status} at ${host}/api/chat. ${detail}`);
  }
  const body = (await response.json()) as { message?: { content?: string } };
  const content = stripThink(body.message?.content ?? "");
  if (!content) throw new Error(`Ollama returned an empty note for ${model}.`);
  return content;
}

export async function buildConviction(ticker: string, fresh = false, hostInput?: string, modelInput?: string): Promise<ConvictionMemo> {
  const key = ticker.toUpperCase();
  const host = ollamaHost(hostInput);
  const model = (modelInput || process.env.CONVICTION_MODEL || "qwen3:8b").trim();
  const hit = cache.get(`${key}|${host}|${model}`);
  if (!fresh && hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.memo;
  const articles = await fetchTechNews(key);
  const probe = await listModels(host);
  const system = "You are a buy-side associate. Use only the supplied headlines. Do not invent numbers. Conviction 1 is noise, 3 is incremental, 5 is thesis-changing. Return only JSON.";
  let error: string | null = probe.error;
  let parsed: ReturnType<typeof parseMemo> | null = null;
  if (!error && probe.models.length && !probe.models.some((name) => name === model || name.startsWith(`${model}:`))) {
    error = `Model ${model} is not on ${host}. Pulled: ${probe.models.join(", ")}`;
  }
  if (!error) {
    try {
      const raw = await complete(host, model, [
        { role: "system", content: system },
        { role: "user", content: prompt(key, articles) },
      ]);
      try {
        parsed = parseMemo(raw);
      } catch {
        const repaired = await complete(host, model, [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: raw },
        ]);
        parsed = parseMemo(repaired);
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Local model did not answer.";
    }
  }
  const memo: ConvictionMemo = {
    ticker: key,
    company: techName(key),
    conviction: parsed?.conviction ?? null,
    stance: parsed?.stance ?? "unavailable",
    whatChanged: parsed?.whatChanged ?? "",
    bullPoints: parsed?.bullPoints ?? [],
    bearPoints: parsed?.bearPoints ?? [],
    openQuestions: parsed?.openQuestions ?? [],
    notInSources: parsed?.notInSources ?? [],
    articles,
    model: `${model} @ ${host}`,
    generatedAt: new Date().toISOString(),
    error,
  };
  cache.set(`${key}|${host}|${model}`, { at: Date.now(), memo });
  return memo;
}
