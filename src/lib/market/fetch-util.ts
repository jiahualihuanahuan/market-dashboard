/** Shared, polite fetch helpers: bounded concurrency, retry with backoff on 429/5xx, and in-flight de-duplication. */

export type FetchOptions = { headers?: Record<string, string>; timeoutMs?: number; retries?: number; baseDelayMs?: number };

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchTextRetry(url: string, options: FetchOptions = {}, fetcher: typeof fetch = fetch): Promise<string> {
  const retries = options.retries ?? 2;
  const base = options.baseDelayMs ?? 600;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetcher(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeoutMs ?? 20000) });
      if (response.ok) return await response.text();
      lastError = new Error(`${response.status} ${url}`);
      if (!RETRY_STATUS.has(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await sleep(base * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(`Fetch failed ${url}`);
}

const flights = new Map<string, Promise<unknown>>();

/** Runs `fn` once per key at a time; concurrent callers share the same promise. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = flights.get(key);
  if (pending) return pending as Promise<T>;
  const next = fn().finally(() => {
    if (flights.get(key) === next) flights.delete(key);
  });
  flights.set(key, next);
  return next;
}

/** Serializes calls so at most one runs at a time, with `gapMs` between starts (for rate-limited hosts). */
export function serialQueue(gapMs: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  let last = 0;
  return <T>(fn: () => Promise<T>) => {
    const run = tail.then(async () => {
      const wait = gapMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      return fn();
    });
    tail = run.catch(() => undefined);
    return run;
  };
}

export async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
