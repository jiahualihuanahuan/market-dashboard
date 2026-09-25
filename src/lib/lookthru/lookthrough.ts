import { catalogInstrument, isSynthetic, sectorOf, syntheticInstrument } from "./catalog.ts";
import { convert } from "./format.ts";
import { applyAlias, displaySymbol, equityKey, issuerKey, stripShareClass } from "./tickers.ts";
import type {
  CurrencyCode,
  Instrument,
  LeafExposure,
  LookthroughResult,
  Position,
  PositionView,
  TreeNode,
} from "./types.ts";

const MAX_DEPTH = 5;

function instrumentOf(
  symbol: string,
  bag: Record<string, Instrument>,
): Instrument | undefined {
  const aliased = applyAlias(symbol);
  if (isSynthetic(aliased)) return syntheticInstrument(aliased);
  return (
    bag[aliased] ??
    bag[issuerKey(aliased)] ??
    bag[stripShareClass(aliased)] ??
    catalogInstrument(aliased)
  );
}

function isExpandable(inst: Instrument | undefined): boolean {
  if (!inst) return false;
  if (inst.kind === "equity" || inst.kind === "cash" || inst.kind === "other") return false;
  return Boolean(inst.holdings && inst.holdings.length > 0);
}

export function composeLookthrough(
  positions: Position[],
  instruments: Record<string, Instrument>,
  aliases: Record<string, string>,
  usdCad: number,
  currency: CurrencyCode,
  warnings: string[] = [],
): LookthroughResult {
  const views: PositionView[] = [];
  const unresolved: string[] = [];
  const leafMap = new Map<string, LeafExposure>();
  const trees: TreeNode[] = [];

  for (const pos of positions) {
    const resolved = aliases[applyAlias(pos.ticker)] ?? applyAlias(pos.ticker);
    const inst = instrumentOf(resolved, instruments);
    if (!inst || inst.price == null) {
      unresolved.push(pos.ticker);
      views.push({
        id: pos.id,
        ticker: pos.ticker,
        resolved,
        name: inst?.name ?? pos.ticker,
        kind: inst?.kind ?? "equity",
        shares: pos.shares,
        price: inst?.price ?? null,
        currency: inst?.currency ?? currency,
        value: 0,
        weight: 0,
        changePct: inst?.changePct ?? null,
        coverage: inst?.coverage ?? 0,
        source: inst?.source ?? "yahoo",
        asOf: inst?.asOf,
      });
      continue;
    }
    const value = convert(pos.shares * inst.price, inst.currency, currency, usdCad);
    views.push({
      id: pos.id,
      ticker: pos.ticker,
      resolved: inst.symbol,
      name: inst.name,
      kind: inst.kind,
      shares: pos.shares,
      price: inst.price,
      currency: inst.currency,
      value,
      weight: 0,
      changePct: inst.changePct,
      coverage: inst.coverage,
      source: inst.source,
      asOf: inst.asOf,
    });
  }

  const nav = views.reduce((s, v) => s + v.value, 0);
  for (const v of views) v.weight = nav > 0 ? v.value / nav : 0;

  function addLeaf(
    symbol: string,
    name: string,
    kind: LeafExposure["kind"],
    sector: string,
    value: number,
    from: string,
    contribWeight: number,
  ) {
    const key = equityKey(symbol);
    const existing = leafMap.get(key);
    if (existing) {
      existing.value += value;
      existing.sources.push({ from, weight: contribWeight, value });
      return;
    }
    leafMap.set(key, {
      symbol: key,
      displaySymbol: displaySymbol(symbol),
      name,
      kind,
      sector,
      value,
      weight: 0,
      sources: [{ from, weight: contribWeight, value }],
    });
  }

  function expand(
    symbol: string,
    nameHint: string,
    value: number,
    weightOfNav: number,
    depth: number,
    trail: Set<string>,
    sectorHint?: string,
  ): TreeNode {
    const inst = instrumentOf(symbol, instruments);
    const name = inst?.name ?? nameHint;
    const kind = inst?.kind ?? (isSynthetic(symbol) ? syntheticInstrument(symbol).kind : "equity");
    const display = inst?.displaySymbol ?? displaySymbol(symbol);
    const node: TreeNode = {
      symbol: inst?.symbol ?? symbol,
      displaySymbol: display,
      name,
      kind,
      weightOfParent: 0,
      weightOfNav,
      value,
      sector: sectorHint ?? (inst ? sectorOf(inst.symbol) : sectorOf(symbol)),
      children: [],
    };

    const key = issuerKey(symbol);
    if (depth >= MAX_DEPTH || trail.has(key) || !isExpandable(inst)) {
      addLeaf(
        symbol,
        name,
        kind,
        node.sector ?? "Other",
        value,
        [...trail].pop() ?? display,
        weightOfNav,
      );
      return node;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(key);
    const holdings = inst!.holdings ?? [];
    let accounted = 0;
    for (const h of holdings) {
      const childValue = value * h.weight;
      const childWeight = weightOfNav * h.weight;
      accounted += h.weight;
      const child = expand(
        h.symbol,
        h.name,
        childValue,
        childWeight,
        depth + 1,
        nextTrail,
        h.sector,
      );
      child.weightOfParent = h.weight;
      node.children.push(child);
    }
    const remainder = 1 - accounted;
    if (Math.abs(remainder) > 0.005) {
      const child = expand(
        "OTHER",
        "Other / undisclosed",
        value * remainder,
        weightOfNav * remainder,
        MAX_DEPTH,
        nextTrail,
        "Other",
      );
      child.weightOfParent = remainder;
      node.children.push(child);
    }
    return node;
  }

  for (const view of views) {
    if (view.value === 0) continue;
    const tree = expand(
      view.resolved,
      view.name,
      view.value,
      view.weight,
      0,
      new Set(),
    );
    tree.weightOfParent = 1;
    trees.push(tree);
  }

  const leaves = [...leafMap.values()].sort((a, b) => b.value - a.value);
  for (const leaf of leaves) leaf.weight = nav > 0 ? leaf.value / nav : 0;

  const sectorMap = new Map<string, number>();
  for (const leaf of leaves) {
    const name = leaf.kind === "cash" ? "Cash & leverage" : leaf.sector || "Other";
    sectorMap.set(name, (sectorMap.get(name) ?? 0) + leaf.value);
  }
  const sectors = [...sectorMap.entries()]
    .map(([name, value]) => ({ name, value, weight: nav > 0 ? value / nav : 0 }))
    .sort((a, b) => b.value - a.value);

  const equityExposure = leaves
    .filter((l) => l.kind === "equity" || l.kind === "etf")
    .reduce((s, l) => s + l.weight, 0);

  return {
    nav,
    currency,
    equityExposure,
    positions: views,
    leaves,
    sectors,
    trees,
    unresolved,
    warnings,
    fxUsdCad: usdCad,
  };
}
