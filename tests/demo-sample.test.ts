// The "Use the sample debrief" button has to put the exact text the canned
// extraction was frozen against into the box — a single character of drift
// sends the rehearsed path live (and, with live mode off, into the demo-only
// notice). lib/demo-sample.ts holds the text as a literal so the client
// bundle never carries the whole seed file; this test is what keeps the two
// in step.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCannedExtraction } from "@/lib/canned";
import { SAMPLE_DEBRIEF } from "@/lib/demo-sample";

const seed = JSON.parse(readFileSync("data/seed-data.json", "utf8")) as {
  demo_debrief_2: { raw_text: string };
};

describe("SAMPLE_DEBRIEF", () => {
  it("is exactly the seed file's demo debrief", () => {
    expect(SAMPLE_DEBRIEF).toBe(seed.demo_debrief_2.raw_text);
  });

  it("hits the canned extraction fixture", () => {
    expect(getCannedExtraction(SAMPLE_DEBRIEF)).not.toBeNull();
  });
});
