import { describe, expect, it } from "vitest";
import { validateExtractedClaims } from "@/lib/validate";

const VALID = {
  claim: "The vehicle limit is now 5 tonnes.",
  leg: "PL_ENTRY",
  entities: { thresholds: ["5t vehicle limit"] },
  date_observed: "2026-08",
  first_person: true,
  hearsay: true,
  confidence: "medium",
  verbatim_quote: "the guard said it changed",
  matches_existing_id: "PL-004",
  relation_if_match: "contradicts",
};

describe("validateExtractedClaims", () => {
  it("accepts a valid array and returns typed claims", () => {
    const result = validateExtractedClaims([VALID]);
    expect(result).toHaveLength(1);
    expect(result[0].leg).toBe("PL_ENTRY");
  });

  it("rejects non-array input", () => {
    expect(() => validateExtractedClaims({ not: "an array" })).toThrow(/array/i);
  });

  it("rejects an invalid leg", () => {
    expect(() =>
      validateExtractedClaims([{ ...VALID, leg: "DE_TRANSIT" }]),
    ).toThrow(/leg/);
  });

  it("rejects a missing claim text", () => {
    expect(() => validateExtractedClaims([{ ...VALID, claim: "" }])).toThrow(
      /claim/,
    );
  });

  it("normalises bare-string entity values to arrays", () => {
    const result = validateExtractedClaims([
      { ...VALID, entities: { crossings: "Medyka", forms: ["T1"] } },
    ]);
    expect(result[0].entities.crossings).toEqual(["Medyka"]);
    expect(result[0].entities.forms).toEqual(["T1"]);
  });

  it("defaults absent match fields to null", () => {
    const { matches_existing_id, relation_if_match, ...rest } = VALID;
    const result = validateExtractedClaims([rest]);
    expect(result[0].matches_existing_id).toBeNull();
    expect(result[0].relation_if_match).toBeNull();
  });

  it("rejects an invalid relation value", () => {
    expect(() =>
      validateExtractedClaims([{ ...VALID, relation_if_match: "updates" }]),
    ).toThrow(/relation/);
  });
});
