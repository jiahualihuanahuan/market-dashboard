/**
 * Keeps the Node server up and runs one care pass per day.
 *
 * - If the server process exits, it is started again.
 * - Every minute a local /api/health probe runs; three misses restart the server.
 * - At CARE_AT (local TZ, default 06:30) and once after boot, POST /api/care
 *   refreshes the in-memory market cache.
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";

const port = process.env.PORT || "8080";
const careAt = process.env.CARE_AT || "06:30";
const token = process.env.CARE_TOKEN || "";
const logPath = process.env.CARE_LOG || "/var/log/marketdesk/care.log";
const base = `http://127.0.0.1:${port}`;

mkdirSync("/var/log/marketdesk", { recursive: true });
mkdirSync("/data", { recursive: true });

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    if (statSync(logPath).size > 1_000_000) renameSync(logPath, `${logPath}.1`);
  } catch {
    // first write, or the rotated file is missing
  }
  try {
    appendFileSync(logPath, text);
  } catch (error) {
    console.error("care log write failed", error);
  }
  console.log(text.trim());
}

function msUntil(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  const hour = match ? Number(match[1]) : 6;
  const minute = match ? Number(match[2]) : 30;
  const safeHour = Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 6;
  const safeMinute = Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 30;
  const now = new Date();
  const next = new Date(now);
  next.setHours(safeHour, safeMinute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

let child = null;
let stopping = false;
let misses = 0;

function startServer() {
  if (stopping || child) return;
  log("starting server");
  child = spawn("node", [".output/server/index.mjs"], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    log(`server exited code=${code ?? ""} signal=${signal ?? ""}`);
    child = null;
    misses = 0;
    if (!stopping) setTimeout(startServer, 3000);
  });
}

function restartServer(reason) {
  log(reason);
  if (child && !child.killed) child.kill("SIGTERM");
}

async function healthOk() {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilHealthy(tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    if (await healthOk()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function warm(label) {
  if (!token) {
    log(`${label}: CARE_TOKEN missing, skip refresh`);
    return;
  }
  try {
    const res = await fetch(`${base}/api/care`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(180000),
    });
    const body = await res.text();
    log(`${label}: status=${res.status} ${body.slice(0, 500)}`);
  } catch (error) {
    log(`${label}: failed ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function dailyLoop() {
  const up = await waitUntilHealthy();
  log(up ? "server is healthy" : "server did not become healthy after start");
  if (up && process.env.CARE_ON_START !== "0") await warm("startup care");

  while (!stopping) {
    const wait = msUntil(careAt);
    log(`next daily care in ${Math.round(wait / 60000)} min at ${careAt} (${process.env.TZ || "local"})`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    if (!(await healthOk())) {
      restartServer("daily care found the server unhealthy");
      await waitUntilHealthy();
    }
    await warm("daily care");
  }
}

async function watchdog() {
  if (stopping || !child) return;
  const ok = await healthOk();
  if (ok) {
    misses = 0;
    return;
  }
  misses += 1;
  log(`health miss ${misses}`);
  if (misses >= 3) {
    misses = 0;
    restartServer("three health misses, restarting server");
  }
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  log("shutting down");
  if (child && !child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startServer();
setInterval(() => {
  watchdog().catch((error) => log(`watchdog error ${error instanceof Error ? error.message : String(error)}`));
}, 60_000);
dailyLoop().catch((error) => {
  log(`care loop error ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
