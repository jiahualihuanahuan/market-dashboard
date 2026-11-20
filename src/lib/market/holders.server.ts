import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import readline from "node:readline";
import { Readable } from "node:stream";
import type { HolderAggregate, HolderBook, HolderManager, HolderSearch } from "@/lib/market/holders";

const UA = "MarketDesk research research@marketdesk.app";
const ZIP = "/tmp/market-desk-form13f.zip";
const CANDIDATES = [
  "https://www.sec.gov/files/datastandardsinnovation/data/form-13f-data-sets/01sep2026-30nov2026_form13f.zip",
  "https://www.sec.gov/files/structureddata/data/form-13f-data-sets/01sep2026-30nov2026_form13f.zip",
  "https://www.sec.gov/files/datastandardsinnovation/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip",
  "https://www.sec.gov/files/structureddata/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip",
  "https://www.sec.gov/files/structureddata/data/form-13f-data-sets/01mar2026-31may2026_form13f.zip",
];

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

type Directory = HolderSearch & { managers: HolderManager[]; aggregate: HolderAggregate[] };
type Filing = { accession: string; cik: string; filed: string; period: string; type: string; name: string };

let cache: { at: number; data: Directory } | null = null;
let pending: Promise<Directory> | null = null;
const bookCache = new Map<string, { at: number; data: HolderBook }>();
const bookFlights = new Map<string, Promise<HolderBook>>();
let secChain: Promise<void> = Promise.resolve();
let secLast = 0;

export function loadHolders(query = ""): Promise<HolderSearch> {
  return loadDirectory().then((data) => filterDirectory(data, query));
}

export function loadHolderBook(cikRaw: string): Promise<HolderBook> {
  const cik = cikRaw.replace(/\D/g, "").padStart(10, "0");
  const saved = bookCache.get(cik);
  if (saved && !saved.data.error && Date.now() - saved.at < 6 * 60 * 60 * 1000) return Promise.resolve(saved.data);
  const flight = bookFlights.get(cik);
  if (flight) return flight;
  const next = fetchHolderBook(cik).finally(() => {
    if (bookFlights.get(cik) === next) bookFlights.delete(cik);
  });
  bookFlights.set(cik, next);
  return next;
}

async function fetchHolderBook(cik: string): Promise<HolderBook> {
  const empty: HolderBook = { cik, name: "", filed: "", period: "", url: edgarUrl(cik), value: 0, count: 0, holdings: [], error: null };
  if (cik === "0000000000") return { ...empty, error: "That is not a CIK." };
  try {
    const json = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const name = String(json?.name ?? "Unnamed filer");
    const recent = json?.filings?.recent;
    const forms: string[] = recent?.form ?? [];
    let best = -1;
    for (let i = 0; i < forms.length; i += 1) {
      if (forms[i] !== "13F-HR" && forms[i] !== "13F-HR/A") continue;
      if (best < 0 || recent.filingDate[i] > recent.filingDate[best] || (recent.filingDate[i] === recent.filingDate[best] && forms[i].endsWith("/A"))) best = i;
    }
    if (best < 0) return { ...empty, name, error: "No 13F on file." };
    const acc = String(recent.accessionNumber[best]);
    const folder = acc.replace(/-/g, "");
    const bare = String(Number(cik));
    const page = `https://www.sec.gov/Archives/edgar/data/${bare}/${folder}/${acc}-index.html`;
    const filed = String(recent.filingDate[best] ?? "");
    const period = String(recent.reportDate?.[best] ?? "");
    let holdings = parseInfoTable(await getText(`https://www.sec.gov/Archives/edgar/data/${bare}/${folder}/${acc}.txt`));
    if (!holdings.length) holdings = await holdingsFromIndex(bare, folder);
    const value = holdings.reduce((sum, row) => sum + row.value, 0);
    const book: HolderBook = {
      cik,
      name,
      filed,
      period,
      url: page,
      value,
      count: holdings.length,
      holdings: holdings.slice(0, 80),
      error: holdings.length ? null : "Filing found, but the holdings table did not parse.",
    };
    if (!book.error) bookCache.set(cik, { at: Date.now(), data: book });
    return book;
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Filing lookup failed." };
  }
}

async function holdingsFromIndex(bare: string, folder: string): Promise<HolderBook["holdings"]> {
  const index = await getJson(`https://www.sec.gov/Archives/edgar/data/${bare}/${folder}/index.json`);
  const items = (index?.directory?.item ?? []) as { name?: string; size?: string }[];
  const xmls = items
    .filter((item) => item.name?.toLowerCase().endsWith(".xml") && !item.name.toLowerCase().includes("primary"))
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
  for (const item of xmls.slice(0, 3)) {
    const xml = await getText(`https://www.sec.gov/Archives/edgar/data/${bare}/${folder}/${item.name}`);
    if (!/infoTable|nameOfIssuer/i.test(xml)) continue;
    const holdings = parseInfoTable(xml);
    if (holdings.length) return holdings;
  }
  return [];
}

function filterDirectory(data: Directory, query: string): HolderSearch {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  const digits = q.replace(/\D/g, "");
  const managers = (q
    ? data.managers.filter((manager) => manager.name.toLowerCase().includes(q) || (digits.length >= 3 && manager.cik.includes(digits)))
    : data.managers
  ).slice(0, q ? 40 : 25);
  const aggregate = (q
    ? data.aggregate.filter((row) => row.issuer.toLowerCase().includes(q) || row.cusip.toLowerCase().includes(q.replace(/\s+/g, "")))
    : data.aggregate
  ).slice(0, 40);
  return {
    quarter: data.quarter,
    source: data.source,
    managerCount: data.managers.length,
    issuerCount: data.aggregate.length,
    managerTotal: data.managers.reduce((sum, manager) => sum + manager.value, 0),
    stockTotal: data.aggregate.reduce((sum, row) => sum + row.value, 0),
    managers,
    aggregate,
    widelyHeld: data.widelyHeld,
  };
}

function loadDirectory(): Promise<Directory> {
  if (cache && Date.now() - cache.at < 12 * 60 * 60 * 1000) return Promise.resolve(cache.data);
  if (!pending) {
    pending = buildDirectory()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

async function buildDirectory(): Promise<Directory> {
  const source = await ensureZip();
  const filings = new Map<string, Filing>();
  for await (const row of tsv(ZIP, "SUBMISSION.tsv")) {
    const type = row.SUBMISSIONTYPE ?? "";
    if (type !== "13F-HR" && type !== "13F-HR/A") continue;
    const accession = row.ACCESSION_NUMBER ?? "";
    const cik = (row.CIK ?? "").padStart(10, "0");
    if (!accession || cik === "0000000000") continue;
    const next: Filing = {
      accession,
      cik,
      filed: stamp(row.FILING_DATE ?? ""),
      period: stamp(row.PERIODOFREPORT ?? ""),
      type,
      name: "",
    };
    const prev = filings.get(cik);
    if (!prev || newer(next, prev)) filings.set(cik, next);
  }
  const winners = new Map<string, Filing>();
  for (const filing of filings.values()) winners.set(filing.accession, filing);
  for await (const row of tsv(ZIP, "COVERPAGE.tsv")) {
    const filing = winners.get(row.ACCESSION_NUMBER ?? "");
    const name = clean(row.FILINGMANAGER_NAME ?? "");
    if (filing && name && !filing.name) filing.name = name;
  }
  const managers = new Map<string, HolderManager>();
  const aggregate = new Map<string, HolderAggregate & { last: string; names: Map<string, number> }>();
  let current = "";
  const seen = new Set<string>();
  for await (const row of tsv(ZIP, "INFOTABLE.tsv")) {
    const accession = row.ACCESSION_NUMBER ?? "";
    const filing = winners.get(accession);
    if (!filing) continue;
    if ((row.PUTCALL ?? "").trim()) continue;
    const value = Number(row.VALUE);
    if (!Number.isFinite(value)) continue;
    const cusip = (row.CUSIP ?? "").trim().toUpperCase();
    if (!/^[0-9A-Z]{8,9}$/.test(cusip)) continue;
    const issuer = clean(row.NAMEOFISSUER ?? "") || cusip;
    const key = cusip;
    if (accession !== current) {
      seen.clear();
      current = accession;
    }
    const first = !seen.has(key);
    if (first) seen.add(key);
    const shares = (row.SSHPRNAMTTYPE ?? "").trim() === "SH" ? Number(row.SSHPRNAMT) : 0;
    let manager = managers.get(filing.cik);
    if (!manager) {
      manager = { cik: filing.cik, name: filing.name || `CIK ${filing.cik}`, value: 0, positions: 0, period: filing.period, filed: filing.filed };
      managers.set(filing.cik, manager);
    }
    manager.value += value;
    if (first) manager.positions += 1;
    const bucket = aggregate.get(key) ?? { issuer, cusip, value: 0, managers: 0, shares: 0, last: "", names: new Map<string, number>() };
    if (first) bucket.names.set(issuer, (bucket.names.get(issuer) ?? 0) + 1);
    bucket.value += value;
    if (Number.isFinite(shares)) bucket.shares += shares;
    if (first && bucket.last !== accession) {
      bucket.managers += 1;
      bucket.last = accession;
    }
    aggregate.set(key, bucket);
  }
  const managerRows = [...managers.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const issuerRows = [...aggregate.values()]
    .map(({ last: _last, names, ...row }) => ({ ...row, issuer: commonName(names, row.issuer) }))
    .sort((a, b) => b.value - a.value || a.issuer.localeCompare(b.issuer));
  const widelyHeld = issuerRows
    .filter((row) => row.managers >= 2)
    .sort((a, b) => b.managers - a.managers || b.value - a.value)
    .slice(0, 100);
  const quarter = managerRows[0]?.period || "";
  return {
    quarter,
    source,
    managerCount: managerRows.length,
    issuerCount: issuerRows.length,
    managerTotal: managerRows.reduce((sum, manager) => sum + manager.value, 0),
    stockTotal: issuerRows.reduce((sum, row) => sum + row.value, 0),
    managers: managerRows,
    aggregate: issuerRows,
    widelyHeld,
  };
}

function commonName(names: Map<string, number>, fallback: string): string {
  let best = fallback;
  let count = -1;
  for (const [name, votes] of names) {
    if (votes > count || (votes === count && name.length < best.length)) {
      best = name;
      count = votes;
    }
  }
  return best;
}

function newer(next: Filing, prev: Filing): boolean {
  if (next.period !== prev.period) return next.period > prev.period;
  if (next.filed !== prev.filed) return next.filed > prev.filed;
  return next.type.endsWith("/A") && !prev.type.endsWith("/A");
}

async function* tsv(zip: string, entry: string): AsyncGenerator<Record<string, string>> {
  const child = spawn("unzip", ["-p", zip, entry], { stdio: ["ignore", "pipe", "pipe"] });
  let error = "";
  child.stderr.on("data", (chunk) => {
    error += String(chunk);
  });
  const closed = new Promise<number>((resolve) => child.on("close", resolve));
  const lines = readline.createInterface({ input: child.stdout ?? Readable.from([]), crlfDelay: Infinity });
  let header: string[] = [];
  for await (const line of lines) {
    const cells = line.split("\t");
    if (!header.length) {
      header = cells;
      continue;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) row[header[i]] = cells[i] ?? "";
    yield row;
  }
  const code = await closed;
  if (code !== 0) throw new Error(error.trim() || `Could not read ${entry}.`);
}

async function ensureZip(): Promise<string> {
  try {
    const info = await stat(ZIP);
    if (info.size > 40_000_000 && Date.now() - info.mtimeMs < 7 * 86400000) {
      return CANDIDATES[2];
    }
  } catch {
    // download below
  }
  let last = "The SEC 13F file did not answer.";
  for (const url of CANDIDATES) {
    const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } }).catch(() => null);
    if (!head?.ok) {
      last = head ? `${head.status} ${url}` : last;
      continue;
    }
    const response = await fetch(url, { headers: { "User-Agent": UA } });
    if (!response.ok || !response.body) {
      last = `${response.status} ${url}`;
      continue;
    }
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(ZIP);
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
    });
    return url;
  }
  throw new Error(last);
}

function parseInfoTable(xml: string): HolderBook["holdings"] {
  const plain = xml.replace(/<(\/?)[A-Za-z0-9]+:/g, "<$1");
  const totals = new Map<string, { value: number; shares: number }>();
  for (const block of plain.split(/<infoTable>/i).slice(1)) {
    const issuer = decode(block.match(/<nameOfIssuer>([^<]+)/i)?.[1] ?? "").trim();
    const title = block.match(/<titleOfClass>([^<]+)/i)?.[1] ?? "";
    const value = Number(block.match(/<value>([^<]+)/i)?.[1] ?? "");
    const shares = Number(block.match(/<sshPrnamt>([^<]+)/i)?.[1] ?? "");
    if (!issuer || !Number.isFinite(value)) continue;
    if (/CALL|PUT|WARRANT|RIGHT/i.test(title)) continue;
    const key = issuer.replace(/\s+/g, " ").toUpperCase();
    const prev = totals.get(key) ?? { value: 0, shares: 0 };
    totals.set(key, { value: prev.value + value, shares: prev.shares + (Number.isFinite(shares) ? shares : 0) });
  }
  return [...totals.entries()]
    .map(([issuer, row]) => ({ issuer, value: row.value, shares: row.shares }))
    .sort((a, b) => b.value - a.value);
}

function stamp(value: string): string {
  const [day, month, year] = value.split("-");
  const mm = MONTHS[month?.toUpperCase() ?? ""];
  if (!day || !mm || !year) return value;
  return `${year}-${mm}-${day.padStart(2, "0")}`;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "\"")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function edgarUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR&dateb=&owner=include&count=10`;
}

async function getJson(url: string): Promise<any> {
  return JSON.parse(await getText(url));
}

async function getText(url: string): Promise<string> {
  const run = secChain.then(() => readSec(url));
  secChain = run.then(() => undefined, () => undefined);
  return run;
}

async function readSec(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = Math.max(0, 300 - (Date.now() - secLast));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    secLast = Date.now();
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(25000),
    });
    if (response.status === 429 || response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
  }
  throw new Error(`The SEC is busy. Try again in a minute.`);
}
