// Freezes canned demo fixtures by hitting the live routes once, per handoff
// §Demo reliability. Run against a running server (npm start / npm run dev)
// with a real ANTHROPIC_API_KEY:
//
//   npm run freeze-fixtures                  # extraction + checklist
//   npm run freeze-fixtures -- --keep-extraction   # re-freeze checklist only
//
// After freezing, `npm test` runs the oracle guards (tests/fixtures.test.ts);
// if extraction outcomes drift from the oracle, curate extraction.json and
// re-run with --keep-extraction.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SUGGESTED_QUESTIONS } from "../lib/ask.ts";
import { storeFingerprint } from "../lib/canned.ts";
import type { OperatorClaim } from "../lib/types.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const keepExtraction = process.argv.includes("--keep-extraction");
const askOnly = process.argv.includes("--ask-only");

async function post<T>(
  route: string,
  body: unknown,
  forceLive = false,
): Promise<T> {
  const res = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(forceLive ? { "x-force-live": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${route} ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

const seed = JSON.parse(readFileSync("data/seed-data.json", "utf8")) as {
  demo_debrief_2: { raw_text: string };
};
const debrief = seed.demo_debrief_2.raw_text;
mkdirSync("data/canned", { recursive: true });

await post("/api/reset", {});

if (askOnly) {
  await freezeAsk();
  process.exit(0);
}

let extracted;
if (keepExtraction) {
  extracted = JSON.parse(readFileSync("data/canned/extraction.json", "utf8"))
    .extracted;
  console.log(`reusing extraction.json (${extracted.length} claims)`);
} else {
  console.log("extracting live…");
  const res = await post<{ extracted: unknown[] }>(
    "/api/extract",
    { text: debrief },
    true,
  );
  extracted = res.extracted;
  writeFileSync(
    "data/canned/extraction.json",
    JSON.stringify(
      { input_startswith: debrief.trim().slice(0, 100), extracted },
      null,
      2,
    ),
  );
  console.log(`froze extraction.json (${extracted.length} claims)`);
}

const merged = await post<{
  log: Array<{ action: string; targetId?: string }>;
  claims: OperatorClaim[];
}>("/api/merge", { extracted });
console.log("\nmerge outcomes (oracle wants corroborated:FR-001, conflict:PL-004, one created):");
for (const entry of merged.log) {
  console.log(`  ${entry.action}:${entry.targetId ?? "new"}`);
}

// One full-corridor generation freezes all four leg sections — the route
// generates per-leg in parallel, and canned lookups are per-leg too, so any
// Journey Span serves from this single fixture.
console.log("\ngenerating checklist live (per-leg, in parallel)…");
const cl = await post<{ legs: unknown[] }>("/api/checklist", {}, true);
writeFileSync(
  "data/canned/checklist.json",
  JSON.stringify(
    { store_fingerprint: storeFingerprint(merged.claims), legs: cl.legs },
    null,
    2,
  ),
);
console.log("froze checklist.json");

await post("/api/reset", {});
await freezeAsk();
console.log("\ndone — now run: npm test (oracle guards in tests/fixtures.test.ts)");

// The three rehearsed questions freeze against the SEED store — the chips
// must answer identically whether or not the merge demo has run.
async function freezeAsk() {
  const answers = [];
  for (const question of SUGGESTED_QUESTIONS) {
    console.log(`asking live: ${question}`);
    const res = await post<{
      answer: string;
      cited_ids: string[];
      no_verified_intel: boolean;
    }>("/api/ask", { question }, true);
    answers.push({ question, ...res });
    console.log(
      `  → no_verified_intel=${res.no_verified_intel} cites=[${res.cited_ids.join(", ")}]`,
    );
  }
  writeFileSync(
    "data/canned/ask.json",
    JSON.stringify({ answers }, null, 2),
  );
  console.log("froze ask.json");
}
