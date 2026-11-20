import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchTextRetry, mapPool, serialQueue, singleFlight } from "./fetch-util.ts";

test("fetchTextRetry retries 429/5xx with backoff, then succeeds", async () => {
  let calls = 0;
  const fake = (async () => {
    calls += 1;
    return calls < 3 ? new Response("busy", { status: 503 }) : new Response("ok");
  }) as unknown as typeof fetch;
  assert.equal(await fetchTextRetry("https://x.test", { baseDelayMs: 1 }, fake), "ok");
  assert.equal(calls, 3);
});

test("fetchTextRetry does not retry a 404", async () => {
  let calls = 0;
  const fake = (async () => {
    calls += 1;
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
  await assert.rejects(fetchTextRetry("https://x.test", { baseDelayMs: 1 }, fake), /404/);
  assert.equal(calls, 1);
});

test("singleFlight shares one in-flight call per key", async () => {
  let runs = 0;
  const work = () => new Promise<number>((resolve) => setTimeout(() => resolve(++runs), 5));
  const [a, b] = await Promise.all([singleFlight("k", work), singleFlight("k", work)]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(await singleFlight("k", work), 2);
});

test("serialQueue never runs two jobs at once", async () => {
  const queue = serialQueue(0);
  let active = 0;
  let peak = 0;
  await Promise.all([1, 2, 3, 4].map(() => queue(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
  })));
  assert.equal(peak, 1);
});

test("mapPool keeps order and respects the concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60]);
  assert.equal(peak, 2);
});
