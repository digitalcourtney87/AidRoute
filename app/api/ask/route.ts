import { NextResponse } from "next/server";
import { callClaude, parseModelJson } from "@/lib/anthropic";
import { validateAsk } from "@/lib/ask";
import { getCannedAsk } from "@/lib/canned";
import { ASK_PROMPT } from "@/lib/prompts";
import { getActiveClaims, getState, logAsk } from "@/lib/store";

// POST { question } → { answer, cited_ids, no_verified_intel }. Grounded in
// the active store only; ungrounded answers are withheld by validateAsk.
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

  if (req.headers.get("x-force-live") !== "1") {
    const canned = getCannedAsk(question);
    if (canned) {
      const { answer, cited_ids, no_verified_intel } = canned;
      await logAsk(question, { answer, cited_ids, no_verified_intel });
      return NextResponse.json({ answer, cited_ids, no_verified_intel, canned: true });
    }
  }

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

  try {
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
    console.error("ask failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach the corridor brain just now — try again." },
      { status: 422 },
    );
  }
}
