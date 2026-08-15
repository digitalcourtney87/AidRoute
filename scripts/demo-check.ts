// Pre-rehearsal gate, per handoff §Demo reliability: hits every route with
// the demo inputs and asserts non-error, schema-valid, CANNED responses —
// the demo path must not depend on the network or the API key.
//
//   npm run demo-check          (server must be running; BASE_URL to override)
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function post<T>(route: string, body: unknown): Promise<{ status: number; json: T; ms: number }> {
  const started = Date.now();
  const res = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T, ms: Date.now() - started };
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
const reset1 = await post<{ ok: boolean; claims: number }>("/api/reset", {});
check("POST /api/reset", reset1.status === 200 && reset1.json.ok && reset1.json.claims === 13);

// extract — must be canned and instant
const ex = await post<{ extracted?: unknown[]; canned?: boolean }>("/api/extract", {
  text: seed.demo_debrief_2.raw_text,
});
check(
  "POST /api/extract (canned)",
  ex.status === 200 && ex.json.canned === true && Array.isArray(ex.json.extracted) && ex.json.extracted.length > 0,
  `canned=${ex.json.canned} ${ex.ms}ms`,
);

// merge — oracle outcomes
const mg = await post<{ log?: Array<{ action: string; targetId?: string }> }>(
  "/api/merge",
  { extracted: ex.json.extracted },
);
const outcomes = (mg.json.log ?? []).map((e) => `${e.action}:${e.targetId ?? "new"}`);
check(
  "POST /api/merge (oracle outcomes)",
  mg.status === 200 &&
    outcomes.includes("corroborated:FR-001") &&
    outcomes.includes("conflict:PL-004") &&
    outcomes.some((o) => o.startsWith("created")),
  outcomes.join(", "),
);

// checklist — must be canned against the post-merge state
const cl = await post<{ legs?: Array<{ items: Array<{ source_ids: string[] }> }>; canned?: boolean }>(
  "/api/checklist",
  {},
);
const allCited = (cl.json.legs ?? []).every((l) => l.items.every((i) => i.source_ids.length > 0));
check(
  "POST /api/checklist (canned, all cited)",
  cl.status === 200 && cl.json.canned === true && allCited,
  `canned=${cl.json.canned} ${cl.ms}ms`,
);

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
const reset2 = await post<{ ok: boolean; claims: number }>("/api/reset", {});
check("POST /api/reset (restore)", reset2.status === 200 && reset2.json.claims === 13);

console.log(failures === 0 ? "\nDEMO-CHECK PASSED" : `\nDEMO-CHECK FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
