import { NextResponse } from "next/server";

// POST { extracted: ExtractedClaim[] } → MergeResult + store snapshot. No LLM.
// Implemented by the Screen 1 ticket once the merge engine lands.
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — see the Screen 1 ticket." },
    { status: 501 },
  );
}
