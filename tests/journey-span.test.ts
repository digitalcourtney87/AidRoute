import { describe, expect, it } from "vitest";
import { legsForSpan } from "@/lib/journey-span";

// The confirmed derivation table: starting in France keeps FR_TRANSIT (you
// transit France wherever you began); starting in Poland drops PL_ENTRY
// (no Polish border left to clear).
describe("legsForSpan", () => {
  it("covers the whole corridor for UK → Ukraine", () => {
    expect(legsForSpan("UK", "UA")).toEqual([
      "GB_EXIT",
      "FR_TRANSIT",
      "PL_ENTRY",
      "UA_ENTRY",
    ]);
  });

  it("stops at the Polish border for UK → Poland", () => {
    expect(legsForSpan("UK", "PL")).toEqual([
      "GB_EXIT",
      "FR_TRANSIT",
      "PL_ENTRY",
    ]);
  });

  it("keeps France transit when starting in France", () => {
    expect(legsForSpan("FR", "UA")).toEqual([
      "FR_TRANSIT",
      "PL_ENTRY",
      "UA_ENTRY",
    ]);
    expect(legsForSpan("FR", "PL")).toEqual(["FR_TRANSIT", "PL_ENTRY"]);
  });

  it("narrows Poland → Ukraine to the single entry leg", () => {
    expect(legsForSpan("PL", "UA")).toEqual(["UA_ENTRY"]);
  });

  it("returns no legs for Poland → Poland", () => {
    expect(legsForSpan("PL", "PL")).toEqual([]);
  });
});
