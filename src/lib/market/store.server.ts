import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "data", "cache");
const memory = new Map<string, unknown>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function readCache<T>(name: string): T | null {
  if (memory.has(name)) {
    const value = memory.get(name);
    return value == null ? null : (value as T);
  }
  try {
    const data = JSON.parse(readFileSync(path.join(dir, `${name}.json`), "utf8")) as T;
    memory.set(name, data);
    return data;
  } catch {
    memory.set(name, null);
    return null;
  }
}

export function writeCache(name: string, data: unknown): void {
  memory.set(name, data);
  const pending = timers.get(name);
  if (pending) clearTimeout(pending);
  timers.set(name, setTimeout(() => {
    timers.delete(name);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data));
    } catch {
      // The in-memory copy still serves this process.
    }
  }, 400));
}
