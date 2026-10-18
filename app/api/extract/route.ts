import { NextResponse } from "next/server";
import {
  LiveLlmUnavailableError,
  callClaude,
  parseModelJson,
} from "@/lib/anthropic";
import { getCannedExtraction } from "@/lib/canned";
import { DEMO_ONLY_EXTRACT_MESSAGE, isLiveLlmEnabled } from "@/lib/live-mode";
import { EXTRACTOR_PROMPT } from "@/lib/prompts";
import { publicErrorMessage } from "@/lib/store-errors";
import { getActiveClaims, logDebrief } from "@/lib/store";
import { validateExtractedClaims } from "@/lib/validate";

// POST { text } → { extracted: ExtractedClaim[], debrief_id }. Known demo
// inputs serve the frozen fixture instantly; unrehearsed text reaches the
// model only when live mode is explicitly on (docs/adr/0005), and otherwise
// comes back as a neutral demo-only notice.
// debrief_id is the capture-trail row (null in memory mode); the client
// passes it back to /api/merge so merge events link to their debrief.
function demoOnly() {
  return NextResponse.json({
    demo_only: true,
    message: DEMO_ONLY_EXTRACT_MESSAGE,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "Paste a debrief first — a few sentences is enough." },
      { status: 400 },
    );
  }

  const liveEnabled = isLiveLlmEnabled();
  // x-force-live is the freeze script's tool for regenerating fixtures. It is
  // honoured only when live mode is explicitly on, so no caller can use it to
  // step off the rehearsed path on the public deployment.
  const forceLive = liveEnabled && req.headers.get("x-force-live") === "1";

  // Known demo inputs serve the frozen fixture instantly.
  if (!forceLive) {
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

  // Demo mode: no canned match means there is nothing rehearsed to show.
  // Stop before the store read — and before logDebrief, so nothing a visitor
  // typed into "Tell us about the trip" is ever persisted (§3.4).
  if (!liveEnabled) return demoOnly();

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
    // A missing or revoked key degrades to the demo notice, never a red error.
    if (err instanceof LiveLlmUnavailableError) {
      console.error("extract: live LLM unavailable —", err.message);
      return demoOnly();
    }
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
