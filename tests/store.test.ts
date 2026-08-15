import { beforeEach, describe, expect, it } from "vitest";
import {
  addClaim,
  getActiveClaims,
  getClaim,
  getState,
  reset,
  updateClaim,
} from "@/lib/store";
import type { OperatorClaim } from "@/lib/types";

beforeEach(() => reset());

describe("store seeding", () => {
  it("loads every seed claim and official rule", () => {
    const { claims, rules } = getState();
    expect(claims).toHaveLength(13);
    expect(rules).toHaveLength(3);
    expect(getClaim("PL-004")?.status).toBe("single_report");
  });

  it("normalises bare-string entity values to arrays", () => {
    for (const claim of getState().claims) {
      for (const values of Object.values(claim.entities)) {
        expect(Array.isArray(values)).toBe(true);
      }
    }
    expect(getClaim("GB-001")?.entities.route_point).toEqual([
      "UK–France crossing (Channel Tunnel)",
    ]);
  });

  it("excludes superseded claims from the active set", () => {
    const active = getActiveClaims();
    expect(active.some((c) => c.id === "PL-001")).toBe(false);
    expect(active.some((c) => c.id === "PL-004")).toBe(true);
  });
});

describe("mutation and reset", () => {
  const newClaim: OperatorClaim = {
    id: "PL-TEST",
    leg: "PL_ENTRY",
    source_class: "operator_reported",
    claim: "Test claim",
    entities: { crossings: ["Testville"] },
    date_observed: "2026-08",
    last_verified: "2026-08",
    first_person: true,
    hearsay: false,
    confidence: "medium",
    status: "single_report",
    n_reports: 1,
  };

  it("supports add and update, and reset() restores the seed", () => {
    addClaim(newClaim);
    updateClaim("FR-001", { n_reports: 2, status: "corroborated" });
    expect(getState().claims).toHaveLength(14);
    expect(getClaim("FR-001")?.n_reports).toBe(2);

    reset();
    expect(getState().claims).toHaveLength(13);
    expect(getClaim("PL-TEST")).toBeUndefined();
    expect(getClaim("FR-001")?.n_reports).toBe(1);
    expect(getClaim("FR-001")?.status).toBe("single_report");
  });
});
