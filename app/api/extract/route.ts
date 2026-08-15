import { NextResponse } from "next/server";
import { callClaude, parseModelJson } from "@/lib/anthropic";
import { getCannedExtraction } from "@/lib/canned";
import { EXTRACTOR_PROMPT } from "@/lib/prompts";
import { getActiveClaims } from "@/lib/store";
import { validateExtractedClaims } from "@/lib/validate";

// POST { text } → { extracted: ExtractedClaim[] }. Canned-fixture fast path
// for known demo inputs arrives with the demo-reliability ticket.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "Paste a debrief first — a few sentences is enough." },
      { status: 400 },
    );
  }

  // Known demo inputs serve the frozen fixture instantly; the freeze script
  // bypasses this with x-force-live to regenerate it.
  if (req.headers.get("x-force-live") !== "1") {
    const canned = getCannedExtraction(text);
    if (canned) return NextResponse.json({ extracted: canned, canned: true });
  }

  const summaries = getActiveClaims().map(({ id, leg, claim, entities }) => ({
    id,
    leg,
    claim,
    entities,
  }));
  const prompt = [
    "DEBRIEF TEXT:",
    text,
    "",
    "EXISTING CLAIMS:",
    JSON.stringify(summaries, null, 2),
  ].join("\n");

  try {
    const raw = await callClaude({ system: EXTRACTOR_PROMPT, prompt });
    const extracted = validateExtractedClaims(parseModelJson(raw));
    return NextResponse.json({ extracted });
  } catch (err) {
    console.error("extract failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't extract intel from that debrief just now. Check the connection and try again — or rephrase the account.",
      },
      { status: 422 },
    );
  }
}
