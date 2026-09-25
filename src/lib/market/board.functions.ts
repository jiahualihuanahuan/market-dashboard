import { createServerFn } from "@tanstack/react-start";

function freshFlag(input: unknown): { fresh: boolean } {
  if (typeof input === "object" && input !== null && "fresh" in input) {
    return { fresh: (input as { fresh?: boolean }).fresh === true };
  }
  return { fresh: false };
}

export const getBoard = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadBoard } = await import("./live.server");
    return loadBoard(data.fresh);
  });

export const getFedWatch = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadFedWatch } = await import("./fedwatch.server");
    return loadFedWatch(data.fresh);
  });

export const getSmartMoney = createServerFn({ method: "GET" })
  .validator(freshFlag)
  .handler(async ({ data }) => {
    const { loadSmartMoney } = await import("./live.server");
    return loadSmartMoney(data.fresh);
  });
