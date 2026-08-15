// Integration test for the Supabase backend. Skipped unless Supabase env is
// present — run manually against a real project (never in CI, never in the
// default `npm test`):
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx vitest run tests/store-supabase.integration.test.ts
//
// NOTE: exercises reset() against the live project — don't point it at a
// store whose current state you care about.
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseBackend } from "@/lib/store-supabase";
import type { ExtractedClaim } from "@/lib/types";

const hasEnv = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const extractedFixture: ExtractedClaim = {
  claim: "Integration-test claim: crossing X now wants form Y.",
  leg: "PL_ENTRY",
  entities: { crossings: ["Integration Test Crossing"], forms: ["Y-FORM"] },
  date_observed: "2026-08-15",
  first_person: true,
  hearsay: false,
  confidence: "low",
  verbatim_quote: "integration test",
  matches_existing_id: null,
  relation_if_match: null,
};

describe.skipIf(!hasEnv)("supabase backend (integration)", () => {
  const backend = hasEnv ? createSupabaseBackend() : null!;

  afterAll(async () => {
    if (hasEnv) await backend.reset();
  });

  it("reset() seeds the corridor from data/seed-data.json", async () => {
    await backend.reset();
    const { claims, rules } = await backend.getState();
    expect(claims).toHaveLength(13);
    expect(rules).toHaveLength(3);
    const gb = claims.find((c) => c.id === "GB-001");
    expect(gb?.entities.route_point).toEqual(["UK–France crossing (Channel Tunnel)"]);
    // Optional fields come back absent, not null — parity with memory backend.
    expect(gb && "superseded_by" in gb).toBe(false);
  });

  it("runMerge persists the pure merge result", async () => {
    await backend.reset();
    const { log, claims } = await backend.runMerge([extractedFixture]);
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("created");
    const persisted = await backend.getState();
    expect(persisted.claims).toHaveLength(claims.length);
    expect(persisted.claims.some((c) => c.claim === extractedFixture.claim)).toBe(true);
  });

  it("two merges from the same starting state both survive (optimistic retry)", async () => {
    await backend.reset();
    const other: ExtractedClaim = {
      ...extractedFixture,
      claim: "Second concurrent integration-test claim.",
      entities: { crossings: ["Other Test Crossing"] },
    };
    const [a, b] = await Promise.all([
      backend.runMerge([extractedFixture]),
      backend.runMerge([other]),
    ]);
    expect(a.log).toHaveLength(1);
    expect(b.log).toHaveLength(1);
    const { claims } = await backend.getState();
    expect(claims.some((c) => c.claim === extractedFixture.claim)).toBe(true);
    expect(claims.some((c) => c.claim === other.claim)).toBe(true);
    expect(claims).toHaveLength(15);
  });

  it("capture trail rows are written and linked", async () => {
    const debriefId = await backend.logDebrief("integration test debrief", [
      extractedFixture,
    ]);
    expect(debriefId).toBeTruthy();
    await backend.logMergeEvents(
      [{ extracted: extractedFixture, action: "created" }],
      debriefId,
    );
    await backend.logAsk("integration test question?", {
      answer: "No verified intel on this.",
      cited_ids: [],
      no_verified_intel: true,
    });
  });
});
