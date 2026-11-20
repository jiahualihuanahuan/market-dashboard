export type TreeBox = { x: number; y: number; w: number; h: number };

type Sized = { area: number };

export function treemap<T extends { value: number }>(items: T[], bounds: TreeBox): Array<T & TreeBox> {
  const data = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total || bounds.w <= 1 || bounds.h <= 1) return [];
  const scale = (bounds.w * bounds.h) / total;
  const sized = data.map((item) => ({ ...item, area: item.value * scale }));
  const out: Array<T & TreeBox & Sized> = [];
  squarify(sized, [], bounds, out);
  return out;
}

function squarify<T extends Sized>(
  items: T[],
  row: T[],
  bounds: TreeBox,
  out: Array<T & TreeBox>,
) {
  if (!items.length) {
    place(row, bounds, out);
    return;
  }
  const side = Math.min(bounds.w, bounds.h);
  const next = items[0];
  if (!row.length || worst(row, side) >= worst([...row, next], side)) {
    squarify(items.slice(1), [...row, next], bounds, out);
    return;
  }
  squarify(items, [], place(row, bounds, out), out);
}

function worst(row: Sized[], side: number) {
  const sum = row.reduce((total, item) => total + item.area, 0);
  const max = Math.max(...row.map((item) => item.area));
  const min = Math.min(...row.map((item) => item.area));
  if (!sum || !side) return Infinity;
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function place<T extends Sized>(row: T[], bounds: TreeBox, out: Array<T & TreeBox>): TreeBox {
  const sum = row.reduce((total, item) => total + item.area, 0);
  if (bounds.w >= bounds.h) {
    const thickness = bounds.h ? sum / bounds.h : 0;
    let y = bounds.y;
    for (const item of row) {
      const h = thickness ? item.area / thickness : 0;
      out.push({ ...item, x: bounds.x, y, w: thickness, h });
      y += h;
    }
    return { x: bounds.x + thickness, y: bounds.y, w: Math.max(bounds.w - thickness, 0), h: bounds.h };
  }
  const thickness = bounds.w ? sum / bounds.w : 0;
  let x = bounds.x;
  for (const item of row) {
    const w = thickness ? item.area / thickness : 0;
    out.push({ ...item, x, y: bounds.y, w, h: thickness });
    x += w;
  }
  return { x: bounds.x, y: bounds.y + thickness, w: bounds.w, h: Math.max(bounds.h - thickness, 0) };
}
