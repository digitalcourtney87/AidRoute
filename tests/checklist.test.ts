import { describe, expect, it } from "vitest";
import { validateChecklistLeg } from "@/lib/checklist";

const VALID_IDS = new Set(["OFF-GB-001", "FR-001", "PL-004"]);

const ITEM = {
  text: "Instruct the customs intermediary to itemise every T1 line.",
  type: "instruct",
  source_ids: ["FR-001"],
};

function section(items: unknown[]) {
  return { leg: "FR_TRANSIT", title: "France — transit", items };
}

describe("validateChecklistLeg", () => {
  it("passes fully-cited items through", () => {
    const result = validateChecklistLeg(section([ITEM]), "FR_TRANSIT", VALID_IDS);
    expect(result.section.items).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops an item citing nothing", () => {
    const uncited = { ...ITEM, source_ids: [] };
    const result = validateChecklistLeg(
      section([ITEM, uncited]),
      "FR_TRANSIT",
      VALID_IDS,
    );
    expect(result.section.items).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toMatch(/cite/i);
  });

  it("drops an item whose only citations are invented ids", () => {
    const invented = { ...ITEM, source_ids: ["XX-999"] };
    const result = validateChecklistLeg(
      section([invented]),
      "FR_TRANSIT",
      VALID_IDS,
    );
    expect(result.section.items).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it("strips invented ids but keeps the item when a real citation remains", () => {
    const mixed = { ...ITEM, source_ids: ["XX-999", "PL-004"] };
    const result = validateChecklistLeg(
      section([mixed]),
      "FR_TRANSIT",
      VALID_IDS,
    );
    expect(result.section.items[0].source_ids).toEqual(["PL-004"]);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops items with an unknown type rather than guessing", () => {
    const badType = { ...ITEM, type: "consider" };
    const result = validateChecklistLeg(
      section([badType]),
      "FR_TRANSIT",
      VALID_IDS,
    );
    expect(result.section.items).toHaveLength(0);
    expect(result.dropped[0].reason).toMatch(/type/i);
  });

  // The leg is pinned by the caller, so a model that mislabels its section
  // can't smuggle items into another leg of the operator's span.
  it("pins the leg to the requested one, not the model's claim", () => {
    const mislabelled = { ...section([ITEM]), leg: "UA_ENTRY" };
    const result = validateChecklistLeg(mislabelled, "FR_TRANSIT", VALID_IDS);
    expect(result.section.leg).toBe("FR_TRANSIT");
  });

  it("throws when the section is not an object", () => {
    expect(() => validateChecklistLeg("nope", "FR_TRANSIT", VALID_IDS)).toThrow(
      /object/i,
    );
  });
});
