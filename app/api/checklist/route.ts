import { NextResponse } from "next/server";

// POST { legs?: Leg[] } → checklist JSON with citation validation.
// Implemented by the checklist ticket.
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — see the checklist ticket." },
    { status: 501 },
  );
}
