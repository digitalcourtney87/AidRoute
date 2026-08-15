// Guards the committed canned fixtures against the seed file's oracle
// (demo_debrief_2.expected_merge_outcomes). If these fail after re-freezing,
// curate data/canned/extraction.json until they pass — the rehearsed demo
// depends on exactly these outcomes.
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { storeFingerprint } from "@/lib/canned";
import type { ChecklistLeg } from "@/lib/checklist";
import { mergeClaims } from "@/lib/merge";
import { getState, reset } from "@/lib/store";
import type { ExtractedClaim } from "@/lib/types";

function loadFixture<T>(file: string): T {
  const p = `data/canned/${file}`;
  if (!existsSync(p)) throw new Error(`missing fixture ${p} — run npm run freeze-fixtures`);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

const extraction = () =>
  loadFixture<{ input_startswith: string; extracted: ExtractedClaim[] }>(
    "extraction.json",
  );
const checklist = () =>
  loadFixture<{ store_fingerprint: string; legs: ChecklistLeg[] }>(
    "checklist.json",
  );

beforeEach(() => reset());

describe("canned extraction vs the seed oracle", () => {
  it("matches the demo debrief input", () => {
    const seed = JSON.parse(readFileSync("data/seed-data.json", "utf8"));
    expect(
      (seed.demo_debrief_2.raw_text as string)
        .trim()
        .startsWith(extraction().input_startswith),
    ).toBe(true);
  });

  it("produces exactly the three oracle outcomes when merged", () => {
    const { log } = mergeClaims(extraction().extracted, getState().claims);
    const outcomes = log.map((e) => `${e.action}:${e.targetId ?? "new"}`);
    expect(outcomes).toContain("corroborated:FR-001");
    expect(outcomes).toContain("conflict:PL-004");
    expect(outcomes.filter((o) => o.startsWith("created"))).toHaveLength(1);
    expect(log).toHaveLength(3);
  });

  it("updates FR-001 to 2 reports, last verified 2026-08", () => {
    const { claims } = mergeClaims(extraction().extracted, getState().claims);
    const fr001 = claims.find((c) => c.id === "FR-001");
    expect(fr001?.n_reports).toBe(2);
    expect(fr001?.status).toBe("corroborated");
    expect(fr001?.last_verified).toBe("2026-08");
  });
});

describe("canned checklist", () => {
  it("is frozen against exactly the post-demo-merge store state", () => {
    const { claims } = mergeClaims(extraction().extracted, getState().claims);
    expect(checklist().store_fingerprint).toBe(storeFingerprint(claims));
  });

  it("cites only ids that exist post-merge and never superseded claims", () => {
    const { claims } = mergeClaims(extraction().extracted, getState().claims);
    const validIds = new Set([
      ...getState().rules.map((r) => r.id),
      ...claims.filter((c) => c.status !== "superseded").map((c) => c.id),
    ]);
    for (const leg of checklist().legs) {
      for (const item of leg.items) {
        expect(item.source_ids.length).toBeGreaterThan(0);
        for (const id of item.source_ids) {
          expect(validIds.has(id), `${id} not a valid citation`).toBe(true);
        }
      }
    }
  });

  it("freezes all three suggested questions, grounded or honestly empty", () => {
    const fixture = loadFixture<{
      answers: Array<{
        question: string;
        answer: string;
        cited_ids: string[];
        no_verified_intel: boolean;
      }>;
    }>("ask.json");
    const validIds = new Set([
      ...getState().rules.map((r) => r.id),
      ...getState().claims.map((c) => c.id),
    ]);
    expect(fixture.answers.map((a) => a.question)).toEqual([
      "Which Polish crossing should we use?",
      "Does the T1 need every item listed?",
      "Can we take donated medicines?",
    ]);
    for (const entry of fixture.answers) {
      if (!entry.no_verified_intel) {
        expect(entry.cited_ids.length).toBeGreaterThan(0);
      }
      for (const id of entry.cited_ids) {
        expect(validIds.has(id), `${id} not in store`).toBe(true);
      }
    }
  });

  it("presents the PL-004 conflict as a verify item citing both accounts", () => {
    const { claims } = mergeClaims(extraction().extracted, getState().claims);
    const partner = claims.find((c) => c.id === "PL-004")?.conflicts_with?.[0];
    expect(partner).toBeDefined();
    const items = checklist().legs.flatMap((l) => l.items);
    const both = items.find(
      (i) =>
        i.type === "verify" &&
        i.source_ids.includes("PL-004") &&
        i.source_ids.includes(partner!),
    );
    expect(both, "no verify item citing both conflict accounts").toBeDefined();
  });
});
