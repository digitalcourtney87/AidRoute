import { NextResponse } from "next/server";
import { callClaude, parseModelJson } from "@/lib/anthropic";
import { getCannedChecklistLeg, storeFingerprint } from "@/lib/canned";
import { validateChecklistLeg, type ChecklistLeg } from "@/lib/checklist";
import { LEG_TITLES } from "@/lib/journey-span";
import { CHECKLIST_LEG_PROMPT } from "@/lib/prompts";
import { publicErrorMessage } from "@/lib/store-errors";
import { getChecklistLeg, getState, putChecklistLeg } from "@/lib/store";
import { LEGS_IN_JOURNEY_ORDER, type Leg } from "@/lib/types";
import type { StoreState } from "@/lib/store";

// POST { legs?: Leg[] } → validated checklist sections for those legs
// (default: the whole corridor). Generation is per-leg (docs/adr/0004): the
// client fans out one request per leg of the operator's Journey Span so each
// section renders as it lands. Each leg resolves through canned → cache →
// honest gap → live model call, so only genuinely new work costs latency.
// Superseded claims are never sent to the model; uncited lines are dropped
// and logged, never rendered.

// Per-leg output is a single section, so it needs a fraction of the tokens
// and wall-clock the whole-corridor call did.
const LEG_MAX_TOKENS = 2048;
const LEG_TIMEOUT_MS = 45_000;

interface ResolvedLeg {
  section: ChecklistLeg;
  dropped: number;
  canned: boolean;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { legs?: unknown };
  const requested = Array.isArray(body.legs)
    ? (body.legs.filter(
        (l): l is Leg =>
          typeof l === "string" && LEGS_IN_JOURNEY_ORDER.includes(l as Leg),
      ))
    : null;
  // An empty-but-present legs array means the caller derived an invalid span;
  // the picker disables that combination, so treat it as a bad request rather
  // than silently generating the whole corridor.
  if (requested && requested.length === 0) {
    return NextResponse.json(
      { error: "Choose a start and destination that cover at least one leg." },
      { status: 400 },
    );
  }
  const legs = requested ?? LEGS_IN_JOURNEY_ORDER;
  const forceLive = req.headers.get("x-force-live") === "1";

  // The store read lives inside the try: a misconfigured backend must surface
  // as this route's JSON error, not an unhandled rejection (raw Next 500).
  try {
    const state = await getState();
    const fingerprint = storeFingerprint(state.claims);

    const resolved = await Promise.all(
      legs.map((leg) => resolveLeg(leg, state, fingerprint, forceLive)),
    );

    return NextResponse.json({
      legs: resolved.map((r) => r.section),
      dropped: resolved.reduce((sum, r) => sum + r.dropped, 0),
      // Only claim "canned" when every section came from the frozen fixture —
      // the demo check asserts on this.
      canned: resolved.every((r) => r.canned),
    });
  } catch (err) {
    console.error("checklist failed:", err);
    return NextResponse.json(
      {
        error: publicErrorMessage(
          err,
          "Couldn't generate the checklist just now. Check the connection and try again.",
        ),
      },
      { status: 422 },
    );
  }
}

async function resolveLeg(
  leg: Leg,
  state: StoreState,
  fingerprint: string,
  forceLive: boolean,
): Promise<ResolvedLeg> {
  if (!forceLive) {
    const canned = getCannedChecklistLeg(state.claims, leg);
    if (canned) return { section: canned, dropped: 0, canned: true };

    const cached = await getChecklistLeg(fingerprint, leg);
    if (cached) return { section: cached, dropped: 0, canned: false };
  }

  const claims = state.claims.filter(
    (c) => c.leg === leg && c.status !== "superseded",
  );
  const rules = state.rules.filter((r) => r.leg === leg);

  // Nothing to compose from: render an honest gap rather than asking the
  // model to write a section out of nothing. Not cached — an empty leg is
  // already instant, and the next merge may fill it.
  if (claims.length === 0 && rules.length === 0) {
    return {
      section: { leg, title: LEG_TITLES[leg], items: [], gap: true },
      dropped: 0,
      canned: false,
    };
  }

  const store = {
    official_rules: rules,
    operator_claims: claims.map(
      ({ id, leg: claimLeg, claim, status, last_verified, n_reports, confidence, entities, conflicts_with }) => ({
        id, leg: claimLeg, claim, status, last_verified, n_reports, confidence, entities,
        ...(conflicts_with ? { conflicts_with } : {}),
      }),
    ),
  };
  // Spell the conflict pairs out — the model reliably presents both accounts
  // only when the pairing is explicit, not implied by matching status fields.
  // The merge engine only ever pairs conflicts within one leg, so a per-leg
  // call can never split a pair.
  const conflictPairs = claims
    .filter((c) => c.status === "conflicting" && (c.conflicts_with ?? []).length > 0)
    .map((c) => `${c.id} ↔ ${(c.conflicts_with ?? []).join(", ")}`);
  const validIds = new Set([
    ...rules.map((r) => r.id),
    ...claims.map((c) => c.id),
  ]);

  const raw = await callClaude({
    system: CHECKLIST_LEG_PROMPT,
    prompt: [
      `LEG: ${leg} (${LEG_TITLES[leg]})`,
      `\nCLAIM STORE FOR THIS LEG:\n${JSON.stringify(store, null, 2)}`,
      conflictPairs.length > 0
        ? `\nCONFLICTING PAIRS (each pair must become one "verify" item citing both ids and presenting both accounts):\n${conflictPairs.join("\n")}`
        : "",
    ].join("\n"),
    maxTokens: LEG_MAX_TOKENS,
    timeoutMs: LEG_TIMEOUT_MS,
  });

  const { section, dropped } = validateChecklistLeg(
    parseModelJson(raw),
    leg,
    validIds,
  );
  for (const item of dropped) {
    console.warn(`checklist line dropped (${item.reason}): ${item.text}`);
  }
  if (!section.title) section.title = LEG_TITLES[leg];

  // Best-effort by contract: a cache write failure must not fail the request.
  await putChecklistLeg(fingerprint, leg, section);

  return { section, dropped: dropped.length, canned: false };
}
