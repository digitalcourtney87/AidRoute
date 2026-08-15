import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/store-errors";
import { logMergeEvents, runMerge } from "@/lib/store";
import { validateExtractedClaims } from "@/lib/validate";

// POST { extracted: ExtractedClaim[], debrief_id? } → { log, claims, rules }.
// No LLM — the deterministic merge engine makes every truth decision. The
// store backend owns atomicity: on Supabase the merge retries under
// optimistic versioning so concurrent debriefs can never silently drop
// each other's claims.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    extracted?: unknown;
    debrief_id?: unknown;
  };

  let extracted;
  try {
    extracted = validateExtractedClaims(body.extracted);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid extracted claims" },
      { status: 400 },
    );
  }

  const debriefId = typeof body.debrief_id === "string" ? body.debrief_id : null;

  try {
    const { log, claims, rules } = await runMerge(extracted);
    await logMergeEvents(log, debriefId);
    return NextResponse.json({ log, claims, rules });
  } catch (err) {
    console.error("merge failed:", err);
    return NextResponse.json(
      {
        error: publicErrorMessage(
          err,
          "Couldn't apply the merge just now — try again.",
        ),
      },
      { status: 503 },
    );
  }
}
