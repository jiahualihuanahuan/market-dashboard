import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_WATCH, sedarSearch, type FilingItem, type FilingsDigest, type WatchName } from "./filings";

const UA = "MarketDeskFilings/0.1 (personal research; contact local)";
const DEFAULT_HOST = "http://192.168.86.35:11434";
const SEEN_PATH = path.join(process.cwd(), "data", "filings-seen.json");

type SeenFile = { ids: string[]; checkedAt: string | null };

const tickerCache = new Map<string, { cik: string; title: string }>();

function hostOf(input?: string): string {
  const raw = (input || process.env.OLLAMA_BASE || DEFAULT_HOST).trim().replace(/\/$/, "");
  return raw.replace(/\/v1$/, "");
}

function modelOf(input?: string): string {
  return (input || process.env.CONVICTION_MODEL || "qwen3:8b").trim();
}

async function readSeen(): Promise<SeenFile> {
  try {
    const raw = await readFile(SEEN_PATH, "utf8");
    const parsed = JSON.parse(raw) as SeenFile;
    return { ids: parsed.ids ?? [], checkedAt: parsed.checkedAt ?? null };
  } catch {
    return { ids: [], checkedAt: null };
  }
}

async function writeSeen(file: SeenFile): Promise<void> {
  await mkdir(path.dirname(SEEN_PATH), { recursive: true });
  await writeFile(SEEN_PATH, JSON.stringify(file, null, 2));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

async function cikFor(ticker: string): Promise<{ cik: string; title: string } | null> {
  const key = ticker.toUpperCase();
  const hit = tickerCache.get(key);
  if (hit) return hit;
  if (tickerCache.size === 0) {
    const body = await getJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
      "https://www.sec.gov/files/company_tickers.json",
    );
    for (const row of Object.values(body)) {
      tickerCache.set(row.ticker.toUpperCase(), {
        cik: String(row.cik_str).padStart(10, "0"),
        title: row.title,
      });
    }
  }
  return tickerCache.get(key) ?? null;
}

type Submission = {
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
};

const SKIP_FORMS = new Set(["4", "3", "5", "144", "SC 13G", "SC 13G/A", "SCHEDULE 13G", "SCHEDULE 13G/A"]);

async function edgarItems(name: WatchName, since: string): Promise<FilingItem[]> {
  const identity = await cikFor(name.ticker);
  if (!identity) return [];
  const body = await getJson<Submission>(`https://data.sec.gov/submissions/CIK${identity.cik}.json`);
  const recent = body.filings?.recent;
  if (!recent?.accessionNumber) return [];
  const rows: FilingItem[] = [];
  for (let i = 0; i < recent.accessionNumber.length && rows.length < 6; i += 1) {
    const filedAt = recent.filingDate?.[i] ?? "";
    if (filedAt < since) continue;
    const form = recent.form?.[i] ?? "filing";
    if (SKIP_FORMS.has(form)) continue;
    const accession = recent.accessionNumber[i];
    const folder = accession.replace(/-/g, "");
    const doc = recent.primaryDocument?.[i] ?? "";
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(identity.cik)}/${folder}/${doc}`;
    rows.push({
      id: `edgar:${accession}`,
      ticker: name.ticker,
      name: name.name,
      source: "edgar",
      form,
      title: recent.primaryDocDescription?.[i] || form,
      filedAt,
      url,
      excerpt: `${form} filed ${filedAt}`,
      isNew: true,
      summary: "",
      material: form.startsWith("8-K") || form === "6-K" ? "high" : form.endsWith("K") || form.endsWith("Q") ? "medium" : "low",
      model: null,
    });
  }
  return rows;
}

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

async function irItems(name: WatchName, since: string): Promise<FilingItem[]> {
  if (!name.irRss) return [];
  try {
    const response = await fetch(name.irRss, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
    return blocks.slice(0, 4).map((block) => {
      const title = decode(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const link = decode(block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? name.irRss ?? "");
      const summary = decode(block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "").slice(0, 600);
      const published = decode(block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
      const filedAt = published ? new Date(published).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      if (filedAt < since) return null;
      const id = `ir:${createHash("sha1").update(`${name.ticker}|${title}|${link}`).digest("hex").slice(0, 16)}`;
      return {
        id,
        ticker: name.ticker,
        name: name.name,
        source: "ir" as const,
        form: "IR",
        title: title || "Investor release",
        filedAt,
        url: link,
        excerpt: summary,
        isNew: true,
        summary: "",
        material: "unknown" as const,
        model: null,
      };
    }).filter((row): row is FilingItem => row != null);
  } catch {
    return [];
  }
}

function sedarCard(name: WatchName): FilingItem | null {
  if (name.market !== "CA") return null;
  return {
    id: `sedar:${name.ticker}`,
    ticker: name.ticker,
    name: name.name,
    source: "sedar",
    form: "SEDAR+",
    title: "Open issuer filings",
    filedAt: new Date().toISOString().slice(0, 10),
    url: sedarSearch(name.name),
    excerpt: "SEDAR+ has no public JSON feed. This card is the regulator search, not a detected new filing.",
    isNew: false,
    summary: "No machine-readable new-filing flag. Check the issuer page for financial statements, MD&A, and material-change reports.",
    material: "unknown",
    model: null,
  };
}

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function summarize(host: string, model: string, item: FilingItem): Promise<Pick<FilingItem, "summary" | "material" | "model">> {
  const prompt = `Source: ${item.source} ${item.form}
Company: ${item.name} (${item.ticker})
Filed: ${item.filedAt}
Title: ${item.title}
Excerpt: ${item.excerpt}
URL: ${item.url}

Write 4 to 6 sentences. Say what kind of document this is, what a holder should look for, and what you cannot know without the full filing. Do not invent figures. End with MATERIAL: high, medium, or low.`;
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: "You summarize public filings for a personal desk. No trade advice. No invented numbers." },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.2, num_predict: 500 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const body = (await response.json()) as { message?: { content?: string } };
  const text = stripThink(body.message?.content ?? "");
  const material = /MATERIAL:\s*high/i.test(text) ? "high" : /MATERIAL:\s*low/i.test(text) ? "low" : "medium";
  return { summary: text.replace(/MATERIAL:\s*(high|medium|low)/i, "").trim(), material, model: `${model} @ ${host}` };
}

function fallback(item: FilingItem): Pick<FilingItem, "summary" | "material" | "model"> {
  return {
    summary: `${item.form} for ${item.name} dated ${item.filedAt}. ${item.excerpt} Local model did not answer, so this is the filing label only.`,
    material: item.material,
    model: null,
  };
}

export async function buildFilingsDigest(input: {
  watch: WatchName[];
  days: number;
  fresh: boolean;
  host?: string;
  model?: string;
}): Promise<FilingsDigest> {
  const host = hostOf(input.host);
  const model = modelOf(input.model);
  const watch = input.watch.length ? input.watch : DEFAULT_WATCH;
  const since = new Date(Date.now() - input.days * 86_400_000).toISOString().slice(0, 10);
  const seen = await readSeen();
  const notes: string[] = [];
  const batches = await Promise.all(
    watch.map(async (name) => {
      try {
        const [edgar, ir] = await Promise.all([edgarItems(name, since), irItems(name, since)]);
        const sedar = sedarCard(name);
        return [...edgar, ...ir, ...(sedar ? [sedar] : [])];
      } catch (cause) {
        notes.push(`${name.ticker}: ${cause instanceof Error ? cause.message : "feed failed"}`);
        return [];
      }
    }),
  );
  const items = batches.flat();
  const known = new Set(seen.ids);
  for (const item of items) {
    if (item.source === "sedar") continue;
    item.isNew = !known.has(item.id);
  }
  const toWrite = items.filter((item) => item.isNew && item.source !== "sedar").slice(0, 8);
  let error: string | null = null;
  for (const item of toWrite) {
    try {
      Object.assign(item, await summarize(host, model, item));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Local model did not answer.";
      Object.assign(item, fallback(item));
    }
  }
  for (const item of items) {
    if (!item.summary) Object.assign(item, fallback(item));
  }
  if (!input.fresh) {
    /* mark seen only when the user asks to record the pass */
  } else {
    const ids = [...known, ...items.filter((item) => item.source !== "sedar").map((item) => item.id)].slice(-400);
    await writeSeen({ ids, checkedAt: new Date().toISOString() });
  }
  items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.filedAt.localeCompare(a.filedAt));
  return { checkedAt: new Date().toISOString(), host, model, error, items, notes };
}
