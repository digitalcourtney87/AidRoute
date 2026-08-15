import { describe, expect, it } from "vitest";
import { NO_INTEL_FALLBACK, validateAsk } from "@/lib/ask";

const VALID_IDS = new Set(["PL-002", "PL-004", "OFF-GB-001"]);

describe("validateAsk", () => {
  it("passes a grounded answer through", () => {
    const result = validateAsk(
      {
        answer: "Operator-reported, last verified Jul 2026: crossings differ.",
        cited_ids: ["PL-002"],
        no_verified_intel: false,
      },
      VALID_IDS,
    );
    expect(result.no_verified_intel).toBe(false);
    expect(result.cited_ids).toEqual(["PL-002"]);
  });

  it("strips invented ids but keeps the answer when real citations remain", () => {
    const result = validateAsk(
      {
        answer: "…",
        cited_ids: ["XX-999", "PL-004"],
        no_verified_intel: false,
      },
      VALID_IDS,
    );
    expect(result.cited_ids).toEqual(["PL-004"]);
    expect(result.no_verified_intel).toBe(false);
  });

  it("replaces an answer whose citations all fail with the no-intel fallback", () => {
    const result = validateAsk(
      {
        answer: "Confidently invented operational advice.",
        cited_ids: ["XX-999"],
        no_verified_intel: false,
      },
      VALID_IDS,
    );
    expect(result.no_verified_intel).toBe(true);
    expect(result.answer).toContain(NO_INTEL_FALLBACK);
    expect(result.answer).not.toContain("invented operational advice");
  });

  it("allows an honest no-intel answer with no citations", () => {
    const result = validateAsk(
      {
        answer:
          "No verified intel on this. Nearest related: PL-002, last reported Jul 2026.",
        cited_ids: [],
        no_verified_intel: true,
      },
      VALID_IDS,
    );
    expect(result.no_verified_intel).toBe(true);
  });

  it("throws on a hopeless shape", () => {
    expect(() => validateAsk({ nope: 1 }, VALID_IDS)).toThrow(/answer/i);
  });
});
