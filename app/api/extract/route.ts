import { NextResponse } from "next/server";
import { callClaude, parseModelJson } from "@/lib/anthropic";
import { getCannedExtraction } from "@/lib/canned";
import { EXTRACTOR_PROMPT } from "@/lib/prompts";
import { publicErrorMessage } from "@/lib/store-errors";
import { getActiveClaims, logDebrief } from "@/lib/store";
import { validateExtractedClaims } from "@/lib/validate";

// POST { text } → { extracted: ExtractedClaim[], debrief_id }. Canned-fixture
// fast path for known demo inputs arrives with the demo-reliability ticket.
// debrief_id is the capture-trail row (null in memory mode); the client
// passes it back to /api/merge so merge events link to their debrief.
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
    if (canned) {
      const debriefId = await logDebrief(text, canned);
      return NextResponse.json({
        extracted: canned,
        canned: true,
        debrief_id: debriefId,
      });
    }
  }

  // The store read lives inside the try: a misconfigured backend must surface
  // as this route's JSON error, not an unhandled rejection (raw Next 500).
  try {
    const active = await getActiveClaims();
    const summaries = active.map(({ id, leg, claim, entities }) => ({
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

    const raw = await callClaude({ system: EXTRACTOR_PROMPT, prompt });
    const extracted = validateExtractedClaims(parseModelJson(raw));
    const debriefId = await logDebrief(text, extracted);
    return NextResponse.json({ extracted, debrief_id: debriefId });
  } catch (err) {
    console.error("extract failed:", err);
    return NextResponse.json(
      {
        error: publicErrorMessage(
          err,
          "Couldn't extract intel from that debrief just now. Check the connection and try again — or rephrase the account.",
        ),
      },
      { status: 422 },
    );
  }
}
