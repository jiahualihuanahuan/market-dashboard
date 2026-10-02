import { createServerFn } from "@tanstack/react-start";

function boardFlag(input: unknown): { fresh: boolean; live: boolean } {
  if (typeof input === "object" && input !== null) {
    const fresh = "fresh" in input && (input as { fresh?: boolean }).fresh === true;
    return { fresh, live: true };
  }
  return { fresh: false, live: true };
}

export const getBoard = createServerFn({ method: "GET" })
  .validator(boardFlag)
  .handler(async ({ data }) => {
    const { loadBoard } = await import("./live.server");
    return loadBoard(data.fresh, data.live);
  });

export const getTape = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const fresh = typeof input === "object" && input !== null && "fresh" in input
      ? (input as { fresh?: boolean }).fresh === true
      : false;
    return { live: true, fresh };
  })
  .handler(async ({ data }) => {
    const { loadTape } = await import("./tape.server");
    return loadTape(data.live, data.fresh);
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

export const getFlows = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const live = typeof input === "object" && input !== null && "live" in input
      ? (input as { live?: boolean }).live === true
      : false;
    return { live };
  })
  .handler(async ({ data }) => {
    const { loadFlows } = await import("./flows.server");
    return loadFlows(data.live);
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

export const getOptions = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const raw = typeof input === "object" && input && "symbol" in input ? String((input as { symbol?: string }).symbol ?? "") : "";
    const live = typeof input === "object" && input !== null && "live" in input ? (input as { live?: boolean }).live === true : false;
    const symbol = raw.trim().toUpperCase().replace(/^\$/, "").replace(/\s+/g, "");
    const cleaned = /^[A-Z]{1,5}\.[A-Z]$/.test(symbol) ? symbol.replace(".", "-") : symbol;
    if (!/^[A-Z^][A-Z0-9.\-]{0,14}$/.test(cleaned)) throw new Error("Enter a stock or ETF ticker.");
    return { symbol: cleaned, live };
  })
  .handler(async ({ data }) => {
    const { loadOptions } = await import("./options.server");
    return loadOptions(data.symbol, data.live);
  });

export const getValuation = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const symbol = typeof input === "object" && input && "symbol" in input ? String((input as { symbol?: string }).symbol ?? "") : "";
    const fresh = typeof input === "object" && input !== null && "fresh" in input ? (input as { fresh?: boolean }).fresh === true : false;
    return { symbol: symbol.slice(0, 12), fresh };
  })
  .handler(async ({ data }) => {
    const { loadValuation } = await import("./valuation.server");
    return loadValuation(data.symbol, data.fresh);
  });

export const getDark = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const live = typeof input === "object" && input !== null && "live" in input
      ? (input as { live?: boolean }).live === true
      : false;
    return { live };
  })
  .handler(async ({ data }) => {
    const { loadDark } = await import("./dark.server");
    return loadDark(data.live);
  });

export const getInsiders = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadInsiders } = await import("./insiders.server");
    return loadInsiders(data.fresh);
  });

export const getSmartMoney = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadSmartMoney } = await import("./live.server");
    return loadSmartMoney(data.fresh);
  });

export const getRotation = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async () => {
    const { loadRotation } = await import("./rotation.server");
    return loadRotation();
  });

export const getHolders = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const query = typeof input === "object" && input && "query" in input ? String((input as { query?: string }).query ?? "") : "";
    return { query: query.slice(0, 80) };
  })
  .handler(async ({ data }) => {
    const { loadHolders } = await import("./holders.server");
    return loadHolders(data.query);
  });

export const getHolderBook = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const cik = typeof input === "object" && input && "cik" in input ? String((input as { cik?: string }).cik ?? "") : "";
    return { cik: cik.slice(0, 12) };
  })
  .handler(async ({ data }) => {
    const { loadHolderBook } = await import("./holders.server");
    return loadHolderBook(data.cik);
  });
