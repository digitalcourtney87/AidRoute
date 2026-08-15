import { describe, expect, it } from "vitest";
import { parseModelJson, stripJsonFences } from "@/lib/anthropic";

describe("stripJsonFences", () => {
  it("passes plain JSON through untouched", () => {
    expect(stripJsonFences('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it("strips ```json fences", () => {
    expect(stripJsonFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("strips bare ``` fences", () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("parseModelJson", () => {
  it("parses a fenced JSON array", () => {
    expect(parseModelJson<number[]>("```json\n[1,2,3]\n```")).toEqual([1, 2, 3]);
  });

  it("recovers JSON wrapped in stray prose", () => {
    expect(
      parseModelJson<{ ok: boolean }>('Here is the result:\n{"ok": true}\nDone.'),
    ).toEqual({ ok: true });
  });

  it("throws a descriptive error on unparseable content", () => {
    expect(() => parseModelJson("no json here at all")).toThrow(/JSON/);
  });
});
