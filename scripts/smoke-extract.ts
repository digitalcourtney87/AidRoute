// One real extraction round-trip using demo_debrief_2 from the seed file.
// Run: npm run smoke:extract   (needs ANTHROPIC_API_KEY in .env.local)
import { readFileSync } from "node:fs";
import { callClaude, parseModelJson } from "../lib/anthropic.ts";
import { EXTRACTOR_PROMPT } from "../lib/prompts.ts";
import type { ExtractedClaim } from "../lib/types.ts";

const seed = JSON.parse(readFileSync("data/seed-data.json", "utf8")) as {
  operator_claims: Array<{
    id: string;
    leg: string;
    claim: string;
    entities: Record<string, unknown>;
  }>;
  demo_debrief_2: { raw_text: string };
};

const summaries = seed.operator_claims.map(({ id, leg, claim, entities }) => ({
  id,
  leg,
  claim,
  entities,
}));

const prompt = [
  "DEBRIEF TEXT:",
  seed.demo_debrief_2.raw_text,
  "",
  "EXISTING CLAIMS:",
  JSON.stringify(summaries, null, 2),
].join("\n");

const raw = await callClaude({ system: EXTRACTOR_PROMPT, prompt });
const extracted = parseModelJson<ExtractedClaim[]>(raw);

if (!Array.isArray(extracted) || extracted.length === 0) {
  console.error("FAIL: expected a non-empty array of extracted claims");
  process.exit(1);
}

const requiredFields: Array<keyof ExtractedClaim> = [
  "claim",
  "leg",
  "entities",
  "date_observed",
  "first_person",
  "hearsay",
  "confidence",
  "verbatim_quote",
];
for (const [i, claim] of extracted.entries()) {
  for (const field of requiredFields) {
    if (!(field in claim)) {
      console.error(`FAIL: claim ${i} missing field "${field}"`);
      process.exit(1);
    }
  }
}

console.log(`OK: ${extracted.length} claims extracted`);
for (const claim of extracted) {
  console.log(
    `- [${claim.leg}] ${claim.claim.slice(0, 80)}… ` +
      `(match: ${claim.matches_existing_id ?? "none"}, relation: ${claim.relation_if_match ?? "n/a"})`,
  );
}
