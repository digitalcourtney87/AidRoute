// Pre-rehearsal gate, per handoff §Demo reliability: hits every route with
// the demo inputs and asserts non-error, schema-valid, CANNED responses —
// the demo path must not depend on the network or the API key.
//
// It also asserts the scripted-demo contract (docs/adr/0005): unrehearsed
// input comes back as a neutral demo_only notice at HTTP 200, never an error,
// and the guided path still works on a store the sample has already run on.
//
//   npm run demo-check                   (server must be running)
//   BASE_URL=https://www.aidroute.org ADMIN_TOKEN=… npm run demo-check
//
// ADMIN_TOKEN is only needed where reset is restricted (any deployment with
// ADMIN_TOKEN or CRON_SECRET set — which on Vercel is all of them).
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SEED_CLAIMS = 13;
let failures = 0;

// Unrehearsed input: nothing in data/canned/ can match these.
const FREE_TYPED_DEBRIEF =
  "Came back through a different crossing last week, nothing like the usual run.";
const FREE_TYPED_QUESTION = "Is the crossing open on a Sunday night?";

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function post<T>(
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: T; ms: number }> {
  const started = Date.now();
  const res = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T, ms: Date.now() - started };
}

// Reset is the one restricted route: send the admin token when we have one.
function postReset() {
  return post<{ ok: boolean; claims: number; error?: string }>(
    "/api/reset",
    {},
    ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {},
  );
}

interface ChecklistBody {
  legs?: Array<{
    leg: string;
    items: Array<{ source_ids: string[] }>;
    gap?: boolean;
    demo_only?: boolean;
  }>;
  canned?: boolean;
  error?: string;
}

interface ExtractBody {
  extracted?: unknown[];
  canned?: boolean;
  demo_only?: boolean;
  message?: string;
}

const seed = JSON.parse(readFileSync("data/seed-data.json", "utf8")) as {
  demo_debrief_2: { raw_text: string };
};

// pages
for (const page of ["/", "/brief", "/checklist"]) {
  const res = await fetch(`${BASE}${page}`);
  check(`GET ${page}`, res.status === 200, `status ${res.status}`);
}

// reset
const reset1 = await postReset();
check(
  "POST /api/reset",
  reset1.status === 200 && reset1.json.ok && reset1.json.claims === SEED_CLAIMS,
  reset1.status === 200 ? `${reset1.json.claims} claims` : `status ${reset1.status} ${reset1.json.error ?? ""}`,
);

// --- scripted-demo contract -------------------------------------------------

// Checklist straight from seed state — the state the 03:00 cron leaves behind,
// which no frozen fixture matches. Every section must be an honest gap or the
// demo-only notice; none may be an error.
const seedChecklist = await post<ChecklistBody>("/api/checklist", {});
const seedLegs = seedChecklist.json.legs ?? [];
check(
  "POST /api/checklist from seed state (no errors, every leg accounted for)",
  seedChecklist.status === 200 &&
    seedLegs.length === 4 &&
    seedLegs.every((l) => l.demo_only === true || l.gap === true),
  seedChecklist.status === 200
    ? seedLegs
        .map((l) => `${l.leg}:${l.demo_only ? "demo_only" : l.gap ? "gap" : "generated"}`)
        .join(", ")
    : `status ${seedChecklist.status} ${seedChecklist.json.error ?? ""}`,
);

// Free-typed debrief: a neutral notice at 200, and nothing extracted.
const freeExtract = await post<ExtractBody>("/api/extract", {
  text: FREE_TYPED_DEBRIEF,
});
check(
  "POST /api/extract free-typed (demo_only, 200)",
  freeExtract.status === 200 &&
    freeExtract.json.demo_only === true &&
    freeExtract.json.extracted === undefined,
  `status ${freeExtract.status} demo_only=${freeExtract.json.demo_only}`,
);

// Free-typed question: same contract.
const freeAsk = await post<{ demo_only?: boolean; answer?: string }>("/api/ask", {
  question: FREE_TYPED_QUESTION,
});
check(
  "POST /api/ask free-typed (demo_only, 200)",
  freeAsk.status === 200 &&
    freeAsk.json.demo_only === true &&
    freeAsk.json.answer === undefined,
  `status ${freeAsk.status} demo_only=${freeAsk.json.demo_only}`,
);

// --- the guided path, twice -------------------------------------------------

// Run it once, then run the whole thing again: the deployed store is shared
// and visitors cannot reset it, so the second run has to land in exactly the
// same state as the first (docs/adr/0005 T4).
for (const run of ["first run", "second run"] as const) {
  const ex = await post<ExtractBody>("/api/extract", {
    text: seed.demo_debrief_2.raw_text,
  });
  check(
    `POST /api/extract (canned) — ${run}`,
    ex.status === 200 &&
      ex.json.canned === true &&
      Array.isArray(ex.json.extracted) &&
      ex.json.extracted.length > 0,
    `canned=${ex.json.canned} ${ex.ms}ms`,
  );

  const mg = await post<{ log?: Array<{ action: string; targetId?: string }> }>(
    "/api/merge",
    { extracted: ex.json.extracted },
  );
  const outcomes = (mg.json.log ?? []).map((e) => `${e.action}:${e.targetId ?? "new"}`);
  check(
    `POST /api/merge (oracle outcomes) — ${run}`,
    mg.status === 200 &&
      outcomes.includes("corroborated:FR-001") &&
      outcomes.includes("conflict:PL-004") &&
      outcomes.some((o) => o.startsWith("created")),
    outcomes.join(", "),
  );

  const cl = await post<ChecklistBody>("/api/checklist", {});
  const allCited = (cl.json.legs ?? []).every((l) =>
    l.items.every((i) => i.source_ids.length > 0),
  );
  check(
    `POST /api/checklist (canned, all cited) — ${run}`,
    cl.status === 200 && cl.json.canned === true && allCited,
    `canned=${cl.json.canned} ${cl.ms}ms`,
  );
}

// ask — all three suggested questions must be canned and schema-valid
try {
  const askFixture = JSON.parse(readFileSync("data/canned/ask.json", "utf8")) as {
    answers: Array<{ question: string }>;
  };
  for (const { question } of askFixture.answers) {
    const ans = await post<{
      answer?: string;
      cited_ids?: string[];
      no_verified_intel?: boolean;
      canned?: boolean;
    }>("/api/ask", { question });
    const grounded =
      ans.json.no_verified_intel === true ||
      (Array.isArray(ans.json.cited_ids) && ans.json.cited_ids.length > 0);
    check(
      `POST /api/ask (canned) — "${question.slice(0, 40)}"`,
      ans.status === 200 && ans.json.canned === true && typeof ans.json.answer === "string" && grounded,
      `canned=${ans.json.canned} ${ans.ms}ms`,
    );
  }
} catch {
  check("ask fixtures present", false, "data/canned/ask.json missing");
}

// reset restores
const reset2 = await postReset();
check(
  "POST /api/reset (restore)",
  reset2.status === 200 && reset2.json.claims === SEED_CLAIMS,
  reset2.status === 200 ? `${reset2.json.claims} claims` : `status ${reset2.status}`,
);

console.log(failures === 0 ? "\nDEMO-CHECK PASSED" : `\nDEMO-CHECK FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
