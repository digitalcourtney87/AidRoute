import { NextResponse } from "next/server";
import { callClaude, parseModelJson } from "@/lib/anthropic";
import { validateChecklist } from "@/lib/checklist";
import { CHECKLIST_PROMPT } from "@/lib/prompts";
import { getActiveClaims, getState } from "@/lib/store";
import type { Leg } from "@/lib/types";

// POST { legs?: Leg[] } → validated checklist. Superseded claims are never
// sent to the model; uncited lines are dropped and logged, never rendered.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { legs?: unknown };
  const requestedLegs = Array.isArray(body.legs)
    ? (body.legs.filter((l) => typeof l === "string") as Leg[])
    : null;

  const { rules } = getState();
  const active = getActiveClaims().filter(
    (c) => !requestedLegs || requestedLegs.includes(c.leg),
  );
  const activeRules = rules.filter(
    (r) => !requestedLegs || requestedLegs.includes(r.leg),
  );

  const store = {
    official_rules: activeRules,
    operator_claims: active.map(
      ({ id, leg, claim, status, last_verified, n_reports, confidence, entities, conflicts_with }) => ({
        id, leg, claim, status, last_verified, n_reports, confidence, entities,
        ...(conflicts_with ? { conflicts_with } : {}),
      }),
    ),
  };
  // Spell the conflict pairs out — the model reliably presents both accounts
  // only when the pairing is explicit, not implied by matching status fields.
  const conflictPairs = active
    .filter((c) => c.status === "conflicting" && (c.conflicts_with ?? []).length > 0)
    .map((c) => `${c.id} ↔ ${(c.conflicts_with ?? []).join(", ")}`);
  const validIds = new Set([
    ...activeRules.map((r) => r.id),
    ...active.map((c) => c.id),
  ]);

  try {
    const raw = await callClaude({
      system: CHECKLIST_PROMPT,
      prompt: [
        `CLAIM STORE:\n${JSON.stringify(store, null, 2)}`,
        conflictPairs.length > 0
          ? `\nCONFLICTING PAIRS (each pair must become one "verify" item citing both ids and presenting both accounts):\n${conflictPairs.join("\n")}`
          : "",
      ].join("\n"),
      maxTokens: 8192,
      timeoutMs: 90_000,
    });
    const { legs, dropped } = validateChecklist(parseModelJson(raw), validIds);
    for (const item of dropped) {
      console.warn(`checklist line dropped (${item.reason}): ${item.text}`);
    }
    return NextResponse.json({ legs, dropped: dropped.length });
  } catch (err) {
    console.error("checklist failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't generate the checklist just now. Check the connection and try again.",
      },
      { status: 422 },
    );
  }
}
