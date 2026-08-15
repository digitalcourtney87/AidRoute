import { NextResponse } from "next/server";

// POST { text: string } → ExtractedClaim[] — implemented by the Screen 1 ticket.
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — see the Screen 1 ticket." },
    { status: 501 },
  );
}
