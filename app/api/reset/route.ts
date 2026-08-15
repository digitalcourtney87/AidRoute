import { NextResponse } from "next/server";
import { getState, reset } from "@/lib/store";

// Restores the seed state so the merge demo can run repeatedly.
//
// Against a persistent store this is the nuclear button, so when ADMIN_TOKEN
// (or Vercel's CRON_SECRET) is configured, callers must present it — via
// x-admin-token or an Authorization bearer. With neither env var set (local
// dev, rehearsed demo) the route stays open, exactly as before.
//
// POST: manual reset (demo button, curl). GET: Vercel cron, which sends
// Authorization: Bearer ${CRON_SECRET} — the nightly reseed that bounds how
// long vandalism can live on the deployed sandbox.
function authorized(req: Request): boolean {
  const tokens = [process.env.ADMIN_TOKEN, process.env.CRON_SECRET].filter(
    (t): t is string => Boolean(t),
  );
  if (tokens.length === 0) return true;
  const header = req.headers.get("x-admin-token");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return tokens.some((t) => t === header || t === bearer);
}

async function doReset() {
  try {
    await reset();
    const { claims, rules } = await getState();
    return NextResponse.json({
      ok: true,
      claims: claims.length,
      rules: rules.length,
    });
  } catch (err) {
    console.error("reset failed:", err);
    return NextResponse.json(
      { error: "Couldn't reset the corridor store just now." },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "Reset is restricted on this deployment." },
      { status: 401 },
    );
  }
  return doReset();
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "Reset is restricted on this deployment." },
      { status: 401 },
    );
  }
  return doReset();
}
