import { describe, expect, it } from "vitest";
import { validateChecklist } from "@/lib/checklist";

const VALID_IDS = new Set(["OFF-GB-001", "FR-001", "PL-004"]);

const ITEM = {
  text: "Instruct the customs intermediary to itemise every T1 line.",
  type: "instruct",
  source_ids: ["FR-001"],
};

function checklist(items: unknown[]) {
  return { legs: [{ leg: "FR_TRANSIT", title: "France — transit", items }] };
}

describe("validateChecklist", () => {
  it("passes fully-cited items through", () => {
    const result = validateChecklist(checklist([ITEM]), VALID_IDS);
    expect(result.legs[0].items).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops an item citing nothing", () => {
    const uncited = { ...ITEM, source_ids: [] };
    const result = validateChecklist(checklist([ITEM, uncited]), VALID_IDS);
    expect(result.legs[0].items).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toMatch(/cite/i);
  });

  it("drops an item whose only citations are invented ids", () => {
    const invented = { ...ITEM, source_ids: ["XX-999"] };
    const result = validateChecklist(checklist([invented]), VALID_IDS);
    expect(result.legs[0].items).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it("strips invented ids but keeps the item when a real citation remains", () => {
    const mixed = { ...ITEM, source_ids: ["XX-999", "PL-004"] };
    const result = validateChecklist(checklist([mixed]), VALID_IDS);
    expect(result.legs[0].items[0].source_ids).toEqual(["PL-004"]);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops items with an unknown type rather than guessing", () => {
    const badType = { ...ITEM, type: "consider" };
    const result = validateChecklist(checklist([badType]), VALID_IDS);
    expect(result.legs[0].items).toHaveLength(0);
    expect(result.dropped[0].reason).toMatch(/type/i);
  });

  it("throws when the top-level shape is not a checklist", () => {
    expect(() => validateChecklist({ nope: true }, VALID_IDS)).toThrow(/legs/i);
  });
});
