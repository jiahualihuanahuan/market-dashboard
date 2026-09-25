import { createServerFn } from "@tanstack/react-start";

function boardFlag(input: unknown): { fresh: boolean; live: boolean } {
  if (typeof input === "object" && input !== null) {
    const live = "live" in input && (input as { live?: boolean }).live === true;
    const fresh = live || ("fresh" in input && (input as { fresh?: boolean }).fresh === true);
    return { fresh, live };
  }
  return { fresh: false, live: false };
}

export const getBoard = createServerFn({ method: "GET" })
  .validator(boardFlag)
  .handler(async ({ data }) => {
    const { loadBoard } = await import("./live.server");
    return loadBoard(data.fresh, data.live);
  });

function freshFlag(input: unknown): { fresh: boolean } {
  if (typeof input === "object" && input !== null && "fresh" in input) {
    return { fresh: (input as { fresh?: boolean }).fresh === true };
  }
  return { fresh: false };
}

export const getFedWatch = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadFedWatch } = await import("./fedwatch.server");
    return loadFedWatch(data.fresh);
  });

export const getHeatmap = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const index = typeof input === "object" && input && "index" in input ? String((input as { index?: string }).index ?? "") : "";
    const live = typeof input === "object" && input !== null && "live" in input
      ? (input as { live?: boolean }).live === true
      : false;
    if (!/^\^[A-Z0-9.]+$/.test(index)) throw new Error("Pick an index.");
    return { index, live };
  })
  .handler(async ({ data }) => {
    const { loadHeatmap } = await import("./heatmap.server");
    return loadHeatmap(data.index, data.live);
  });

export const getFrontier = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const live = typeof input === "object" && input !== null && "live" in input
      ? (input as { live?: boolean }).live === true
      : false;
    return { live };
  })
  .handler(async ({ data }) => {
    const { loadFrontier } = await import("./frontier.server");
    return loadFrontier(data.live);
  });

export const getSmartMoney = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadSmartMoney } = await import("./live.server");
    return loadSmartMoney(data.fresh);
  });
