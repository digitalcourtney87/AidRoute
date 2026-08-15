import { NextResponse } from "next/server";
import { mergeClaims } from "@/lib/merge";
import { getState, replaceClaims } from "@/lib/store";
import { validateExtractedClaims } from "@/lib/validate";

// POST { extracted: ExtractedClaim[] } → { log, claims, rules }. No LLM —
// the deterministic merge engine makes every truth decision.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { extracted?: unknown };

  let extracted;
  try {
    extracted = validateExtractedClaims(body.extracted);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid extracted claims" },
      { status: 400 },
    );
  }

  const { log, claims } = mergeClaims(extracted, getState().claims);
  replaceClaims(claims);

  return NextResponse.json({ log, claims, rules: getState().rules });
}
