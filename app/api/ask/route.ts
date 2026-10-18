import { NextResponse } from "next/server";
import {
  LiveLlmUnavailableError,
  callClaude,
  parseModelJson,
} from "@/lib/anthropic";
import { validateAsk } from "@/lib/ask";
import { getCannedAsk } from "@/lib/canned";
import { DEMO_ONLY_ASK_MESSAGE, isLiveLlmEnabled } from "@/lib/live-mode";
import { ASK_PROMPT } from "@/lib/prompts";
import { publicErrorMessage } from "@/lib/store-errors";
import { getActiveClaims, getState, logAsk } from "@/lib/store";

// POST { question } → { answer, cited_ids, no_verified_intel }. Grounded in
// the active store only; ungrounded answers are withheld by validateAsk.
// The three rehearsed chips serve frozen answers; anything free-typed reaches
// the model only when live mode is explicitly on (docs/adr/0005).
function demoOnly() {
  return NextResponse.json({
    demo_only: true,
    message: DEMO_ONLY_ASK_MESSAGE,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "Ask a question about the corridor first." },
      { status: 400 },
    );
  }

  const liveEnabled = isLiveLlmEnabled();
  // Honoured only in live mode — see /api/extract for why.
  const forceLive = liveEnabled && req.headers.get("x-force-live") === "1";

  if (!forceLive) {
    const canned = getCannedAsk(question);
    if (canned) {
      const { answer, cited_ids, no_verified_intel } = canned;
      await logAsk(question, { answer, cited_ids, no_verified_intel });
      return NextResponse.json({ answer, cited_ids, no_verified_intel, canned: true });
    }
  }

  // Demo mode: stop before the store read and before logAsk — a free-typed
  // question may name real people or places (§3.4).
  if (!liveEnabled) return demoOnly();

  // The store read lives inside the try: a misconfigured backend must surface
  // as this route's JSON error, not an unhandled rejection (raw Next 500).
  try {
    const active = await getActiveClaims();
    const { rules } = await getState();
    const store = {
      official_rules: rules,
      operator_claims: active.map(
        ({ id, leg, claim, status, last_verified, n_reports, confidence, entities, conflicts_with }) => ({
          id, leg, claim, status, last_verified, n_reports, confidence, entities,
          ...(conflicts_with ? { conflicts_with } : {}),
        }),
      ),
    };
    const validIds = new Set([
      ...rules.map((r) => r.id),
      ...active.map((c) => c.id),
    ]);

    const raw = await callClaude({
      system: ASK_PROMPT,
      prompt: `QUESTION: ${question}\n\nCLAIM STORE:\n${JSON.stringify(store, null, 2)}`,
      maxTokens: 2048,
      timeoutMs: 45_000,
    });
    const result = validateAsk(parseModelJson(raw), validIds);
    await logAsk(question, result);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LiveLlmUnavailableError) {
      console.error("ask: live LLM unavailable —", err.message);
      return demoOnly();
    }
    console.error("ask failed:", err);
    return NextResponse.json(
      {
        error: publicErrorMessage(
          err,
          "Couldn't reach the corridor brain just now — try again.",
        ),
      },
      { status: 422 },
    );
  }
}
