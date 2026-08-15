import { describe, expect, it } from "vitest";
import { mergeClaims } from "@/lib/merge";
import { loadSeed } from "@/lib/seed";
import type { ExtractedClaim, OperatorClaim } from "@/lib/types";

// These fixtures are hand-authored ExtractedClaims representing what
// extraction of demo_debrief_2.raw_text should yield. The assertions mirror
// demo_debrief_2.expected_merge_outcomes in data/seed-data.json — the oracle.

const CORROBORATES_FR001: ExtractedClaim = {
  claim:
    "The T1 was filed line-by-line rather than as a bulk total, and the convoy cleared the Polish side in about five hours without issues.",
  leg: "FR_TRANSIT",
  entities: { forms: ["T1"], practices: ["line-by-line itemisation"] },
  date_observed: "2026-08",
  first_person: true,
  hearsay: false,
  confidence: "high",
  verbatim_quote: "we insisted on line-by-line on the T1",
  matches_existing_id: "FR-001",
  relation_if_match: "same",
};

const CONTRADICTS_PL004: ExtractedClaim = {
  claim:
    "The crossing's vehicle limit is now 5 tonnes, not 7 — a border guard said it changed at the start of August.",
  leg: "PL_ENTRY",
  entities: { thresholds: ["5t vehicle limit (was 7t)"] },
  date_observed: "2026-08",
  first_person: true,
  hearsay: true,
  confidence: "medium",
  verbatim_quote: "the guard said it changed at the start of August",
  matches_existing_id: "PL-004",
  relation_if_match: "contradicts",
};

const NEW_CLAIM: ExtractedClaim = {
  claim:
    "The Polish side has started asking for the recipient organisation's registration number, not just the Ukrainian side.",
  leg: "PL_ENTRY",
  entities: { documents: ["recipient organisation registration number"] },
  date_observed: "2026-08",
  first_person: true,
  hearsay: false,
  confidence: "medium",
  verbatim_quote:
    "they've started asking for the recipient organisation's registration number at the Polish side",
  matches_existing_id: null,
  relation_if_match: null,
};

// Pure-engine tests run against pristine seed state read directly from the
// seed file — no store involved.
function seedClaims(): OperatorClaim[] {
  return loadSeed().claims;
}

describe("oracle: expected_merge_outcomes", () => {
  it("corroborates FR-001: n_reports 1→2, last_verified → 2026-08, status → corroborated", () => {
    const { log, claims } = mergeClaims([CORROBORATES_FR001], seedClaims());

    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("corroborated");
    expect(log[0].targetId).toBe("FR-001");

    const fr001 = claims.find((c) => c.id === "FR-001");
    expect(fr001?.n_reports).toBe(2);
    expect(fr001?.last_verified).toBe("2026-08");
    expect(fr001?.status).toBe("corroborated");
    // Corroboration updates the existing claim; it never adds a duplicate.
    expect(claims).toHaveLength(seedClaims().length);
  });

  it("conflicts on PL-004's threshold: similar recency, contradictory → both conflicting, cross-referenced", () => {
    const { log, claims } = mergeClaims([CONTRADICTS_PL004], seedClaims());

    expect(log[0].action).toBe("conflict");
    expect(log[0].targetId).toBe("PL-004");

    const pl004 = claims.find((c) => c.id === "PL-004");
    const added = claims.filter(
      (c) => !seedClaims().some((s) => s.id === c.id),
    );
    expect(added).toHaveLength(1);
    expect(pl004?.status).toBe("conflicting");
    expect(added[0].status).toBe("conflicting");
    expect(pl004?.conflicts_with).toContain(added[0].id);
    expect(added[0].conflicts_with).toContain("PL-004");
    // The engine never resolves a conflict — both accounts survive.
    expect(pl004?.superseded_by).toBeUndefined();
  });

  it("creates the new registration-number claim as PL-007, single_report", () => {
    const { log, claims } = mergeClaims([NEW_CLAIM], seedClaims());

    expect(log[0].action).toBe("created");
    const added = claims.find((c) => c.id === "PL-007");
    expect(added).toBeDefined();
    expect(added?.status).toBe("single_report");
    expect(added?.n_reports).toBe(1);
    expect(added?.source_class).toBe("operator_reported");
    expect(added?.last_verified).toBe("2026-08");
  });

  it("runs the full demo debrief batch to the three oracle outcomes in order", () => {
    const { log } = mergeClaims(
      [CORROBORATES_FR001, CONTRADICTS_PL004, NEW_CLAIM],
      seedClaims(),
    );
    expect(log.map((entry) => entry.action)).toEqual([
      "corroborated",
      "conflict",
      "created",
    ]);
  });
});

describe("merge rules beyond the oracle", () => {
  it("supersedes when the contradiction is more than 60 days newer", () => {
    const lateContradiction: ExtractedClaim = {
      ...CONTRADICTS_PL004,
      matches_existing_id: "FR-001",
      leg: "FR_TRANSIT",
      entities: { forms: ["T1"] },
      claim: "Bulk T1 totals are accepted again as of October.",
      date_observed: "2026-10",
    };
    const { log, claims } = mergeClaims([lateContradiction], seedClaims());

    expect(log[0].action).toBe("superseded");
    expect(log[0].targetId).toBe("FR-001");
    const fr001 = claims.find((c) => c.id === "FR-001");
    const added = claims.filter(
      (c) => !seedClaims().some((s) => s.id === c.id),
    )[0];
    expect(fr001?.status).toBe("superseded");
    expect(fr001?.superseded_by).toBe(added.id);
    expect(added.status).toBe("single_report");
  });

  it("ignores the model's match hint when entity overlap fails, creating a new claim", () => {
    const badHint: ExtractedClaim = {
      ...NEW_CLAIM,
      leg: "FR_TRANSIT",
      entities: { goods: ["completely unrelated cargo"] },
      claim: "Something unrelated to any existing FR claim.",
      matches_existing_id: "FR-001",
      relation_if_match: "same",
    };
    const { log } = mergeClaims([badHint], seedClaims());
    expect(log[0].action).toBe("created");
    expect(log[0].targetId).toBeUndefined();
  });

  it("increments but never resolves a claim already in conflict", () => {
    const first = mergeClaims([CONTRADICTS_PL004], seedClaims());
    const corroborateConflicted: ExtractedClaim = {
      ...CONTRADICTS_PL004,
      claim: "Another report of the 7t limit at the third crossing.",
      entities: { thresholds: ["7t vehicle limit"] },
      relation_if_match: "same",
    };
    const { claims } = mergeClaims([corroborateConflicted], first.claims);
    const pl004 = claims.find((c) => c.id === "PL-004");
    expect(pl004?.status).toBe("conflicting");
    expect(pl004?.n_reports).toBe(2);
  });

  it("treats a numeric threshold contradiction as a contradiction even when the model says same", () => {
    const mislabelled: ExtractedClaim = {
      ...CONTRADICTS_PL004,
      relation_if_match: "same",
    };
    const { log } = mergeClaims([mislabelled], seedClaims());
    expect(log[0].action).toBe("conflict");
  });

  it("does not treat numbers with different units as contradictions", () => {
    // "5 hours" at the crossing must not conflict with PL-004's "3.5t → 7t"
    // vehicle limit — incommensurable quantities are not contradictions.
    const clearanceTime: ExtractedClaim = {
      ...CONTRADICTS_PL004,
      claim: "Cleared the third crossing in about 5 hours with correct paperwork.",
      entities: {
        crossings: ["the third crossing"],
        thresholds: ["5 hours clearance time"],
      },
      relation_if_match: "same",
    };
    const { log } = mergeClaims([clearanceTime], seedClaims());
    expect(log[0].action).toBe("corroborated");
  });

  it("still conflicts when units match but values diverge, across unit spellings", () => {
    const spelledOut: ExtractedClaim = {
      ...CONTRADICTS_PL004,
      entities: { thresholds: ["5 tonnes vehicle limit"] },
      relation_if_match: "same",
    };
    const { log } = mergeClaims([spelledOut], seedClaims());
    expect(log[0].action).toBe("conflict");
  });

  it("never mutates its inputs", () => {
    const before = structuredClone(seedClaims());
    mergeClaims([CORROBORATES_FR001, CONTRADICTS_PL004, NEW_CLAIM], seedClaims());
    expect(seedClaims()).toEqual(before);
  });
});
