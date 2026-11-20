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
  const { loadDesk } = await import("@/lib/desk/desk.server");
  const started = Date.now();
  try {
    const desk = await loadDesk(true);
    return Response.json(
      { ok: true, ms: Date.now() - started, desk: "warm", missing: desk.missing, time: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, ms: Date.now() - started, desk: error instanceof Error ? error.message : "failed", time: new Date().toISOString() },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
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
