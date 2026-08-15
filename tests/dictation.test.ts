import { describe, expect, it } from "vitest";
import { appendTranscript, splitResults } from "@/lib/dictation";

describe("appendTranscript", () => {
  it("returns the chunk alone when there is no existing text", () => {
    expect(appendTranscript("", "we crossed at Medyka")).toBe(
      "we crossed at Medyka",
    );
  });

  it("separates from existing text with a single space", () => {
    expect(appendTranscript("First trip.", "Second thought")).toBe(
      "First trip. Second thought",
    );
  });

  it("preserves the operator's own trailing whitespace verbatim", () => {
    expect(appendTranscript("Line one.\n\n", "Line two")).toBe(
      "Line one.\n\nLine two",
    );
    expect(appendTranscript("Ends with space ", "next")).toBe(
      "Ends with space next",
    );
  });

  it("ignores empty and whitespace-only chunks", () => {
    expect(appendTranscript("Kept as-is.", "")).toBe("Kept as-is.");
    expect(appendTranscript("Kept as-is.", "   \n")).toBe("Kept as-is.");
  });

  it("trims whitespace the engine pads around a chunk", () => {
    expect(appendTranscript("So far.", "  padded phrase  ")).toBe(
      "So far. padded phrase",
    );
  });
});

describe("splitResults", () => {
  it("separates finalised phrases from the interim hypothesis", () => {
    expect(
      splitResults([
        { transcript: "we used the Medyka crossing", isFinal: true },
        { transcript: " and the queue", isFinal: false },
        { transcript: " was about", isFinal: false },
      ]),
    ).toEqual({
      finals: ["we used the Medyka crossing"],
      interim: "and the queue was about",
    });
  });

  it("keeps multiple finals in order and drops empty ones", () => {
    expect(
      splitResults([
        { transcript: "first phrase", isFinal: true },
        { transcript: "   ", isFinal: true },
        { transcript: "second phrase", isFinal: true },
      ]),
    ).toEqual({ finals: ["first phrase", "second phrase"], interim: "" });
  });

  it("returns empties for an empty batch", () => {
    expect(splitResults([])).toEqual({ finals: [], interim: "" });
  });
});
