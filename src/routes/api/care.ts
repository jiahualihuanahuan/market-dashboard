import { createFileRoute } from "@tanstack/react-router";

function careToken(): string {
  if (typeof process === "undefined") return "";
  const value = process.env["CARE_TOKEN"];
  return typeof value === "string" ? value : "";
}

/** Constant-time compare so a wrong token doesn't leak the length via early exit timing. */
function authorized(request: Request): boolean {
  const expected = careToken();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!expected || token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

async function warm(): Promise<Response> {
  const { loadBoard, loadSmartMoney } = await import("@/lib/market/live.server");
  const started = Date.now();
  const [board, smart] = await Promise.allSettled([loadBoard(true), loadSmartMoney(true)]);
  const boardError = board.status === "rejected"
    ? board.reason instanceof Error
      ? board.reason.message
      : "failed"
    : null;
  const smartError = smart.status === "rejected"
    ? smart.reason instanceof Error
      ? smart.reason.message
      : "failed"
    : null;
  const ok = board.status === "fulfilled";
  return Response.json(
    {
      ok,
      ms: Date.now() - started,
      board: boardError ? boardError : "warm",
      smart: smartError ? smartError : "warm",
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 502, headers: { "cache-control": "no-store" } },
  );
}

const handle = ({ request }: { request: Request }) => {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return warm();
};

/** Daily refresh. Requires Authorization: Bearer $CARE_TOKEN. */
export const Route = createFileRoute("/api/care")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
