import assert from "node:assert/strict";
import test from "node:test";
import { drawdown, olsBeta, returnZ, sma, smaSlope } from "./math.ts";

test("sma and slope", () => {
  const xs = Array.from({ length: 40 }, (_, i) => 100 + i);
  const m = sma(xs, 10);
  assert.ok(m != null && Math.abs(m - 134.5) < 1e-9);
  const slope = smaSlope(xs, 10, 10);
  assert.ok(slope != null && slope > 0);
});

test("drawdown from the window high", () => {
  const dd = drawdown([10, 12, 9, 11], 4);
  assert.ok(dd != null && Math.abs(dd - (11 / 12 - 1)) < 1e-9);
});

test("return z uses history before today", () => {
  const closes = [100];
  for (let i = 0; i < 80; i++) closes.push(closes[closes.length - 1]! * (i % 2 ? 1.004 : 0.998));
  closes.push(closes[closes.length - 1]! * 0.9);
  const z = returnZ(closes, 60);
  assert.ok(z.ret != null && z.ret < -0.09);
  assert.ok(z.z != null && z.z < -3);
});

test("ols beta of identical series is one", () => {
  const x = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02, 0.0, -0.005, 0.012, -0.008, 0.004, 0.009, -0.003, 0.006, -0.004, 0.011, 0.002, -0.007, 0.008, -0.001, 0.003];
  const beta = olsBeta(x, x);
  assert.ok(beta != null && Math.abs(beta - 1) < 1e-9);
});
