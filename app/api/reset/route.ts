import { NextResponse } from "next/server";
import { getState, reset } from "@/lib/store";

// POST → restores the seed state so the merge demo can run repeatedly.
export async function POST() {
  reset();
  const { claims, rules } = getState();
  return NextResponse.json({ ok: true, claims: claims.length, rules: rules.length });
}
