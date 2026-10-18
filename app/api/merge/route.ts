import { NextResponse } from "next/server";
import { isCannedExtraction } from "@/lib/canned";
import { isLiveLlmEnabled } from "@/lib/live-mode";
import { publicErrorMessage } from "@/lib/store-errors";
import { logMergeEvents, reset, runMerge } from "@/lib/store";
import { validateExtractedClaims } from "@/lib/validate";

// POST { extracted: ExtractedClaim[], debrief_id? } → { log, claims, rules }.
// No LLM — the deterministic merge engine makes every truth decision. The
// store backend owns atomicity: on Supabase the merge retries under
// optimistic versioning so concurrent debriefs can never silently drop
// each other's claims.
//
// In demo mode the rehearsed sample resets to seed first (docs/adr/0005 T4):
// the deployed store is shared and visitors cannot reset it, so it must only
// ever be in one of two states — seed, or post-sample-merge — or the second
// run of the sample leaves the canned checklist unmatchable for everyone
// until the nightly cron.
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
    if (!isLiveLlmEnabled() && isCannedExtraction(extracted)) {
      await reset();
    }

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
