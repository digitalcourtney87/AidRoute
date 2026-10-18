// The deployed store is shared across visitors and visitors cannot reset it
// (reset needs the admin token). In demo mode the only thing that can mutate
// it is the rehearsed sample, so re-running the sample must leave the store
// in exactly the state the canned checklist was frozen against — otherwise
// the first visitor to run it twice breaks the checklist for everyone until
// the 03:00 cron (docs/adr/0005 T4).
//
// These run against the real in-memory store and the real merge engine: the
// invariant is about what the store actually ends up holding.
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { storeFingerprint } from "@/lib/canned";
import { getState, reset } from "@/lib/store";
import { POST } from "@/app/api/merge/route";
import type { ExtractedClaim } from "@/lib/types";

const FROZEN_FINGERPRINT = (
  JSON.parse(readFileSync("data/canned/checklist.json", "utf8")) as {
    store_fingerprint: string;
  }
).store_fingerprint;

const SAMPLE_EXTRACTION = (
  JSON.parse(readFileSync("data/canned/extraction.json", "utf8")) as {
    extracted: ExtractedClaim[];
  }
).extracted;

const FREE_TYPED_CLAIM: ExtractedClaim = {
  claim: "The Ukrainian side now wants the manifest in triplicate.",
  leg: "UA_ENTRY",
  entities: { documents: ["manifest in triplicate"] },
  date_observed: "2026-09",
  first_person: true,
  hearsay: false,
  confidence: "medium",
  verbatim_quote: "they wanted three copies of the manifest",
  matches_existing_id: null,
  relation_if_match: null,
};

function post(extracted: unknown): Request {
  return new Request("http://localhost/api/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ extracted }),
  });
}

async function fingerprint(): Promise<string> {
  return storeFingerprint((await getState()).claims);
}

beforeEach(async () => {
  await reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/merge in demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", undefined);
  });

  it("leaves the frozen post-sample state however often the sample is run", async () => {
    for (const run of [1, 2, 3]) {
      const res = await POST(post(SAMPLE_EXTRACTION));

      expect(res.status, `run ${run}`).toBe(200);
      expect(await fingerprint(), `run ${run}`).toBe(FROZEN_FINGERPRINT);
    }
  });

  it("still reports the three rehearsed outcomes on a repeat run", async () => {
    await POST(post(SAMPLE_EXTRACTION));
    const res = await POST(post(SAMPLE_EXTRACTION));
    const body = await res.json();
    const outcomes = body.log.map(
      (e: { action: string; targetId?: string }) =>
        `${e.action}:${e.targetId ?? "new"}`,
    );

    expect(outcomes).toContain("corroborated:FR-001");
    expect(outcomes).toContain("conflict:PL-004");
  });

  // The reset is scoped to the rehearsed sample: anything else merges on top
  // of what is there, exactly as before.
  it("does not reset for claims that are not the sample", async () => {
    await POST(post(SAMPLE_EXTRACTION));
    const afterSample = await fingerprint();

    await POST(post([FREE_TYPED_CLAIM]));

    expect(await fingerprint()).not.toBe(afterSample);
    expect((await getState()).claims).toHaveLength(16);
  });
});

describe("/api/merge with live mode on", () => {
  beforeEach(() => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", "on");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-looks-real-enough");
  });

  // Live mode is the local development path: real debriefs accumulate, and
  // the store is nobody else's.
  it("compounds repeat merges rather than resetting", async () => {
    await POST(post(SAMPLE_EXTRACTION));
    await POST(post(SAMPLE_EXTRACTION));

    expect(await fingerprint()).not.toBe(FROZEN_FINGERPRINT);
    expect(
      (await getState()).claims.find((c) => c.id === "FR-001")?.n_reports,
    ).toBe(3);
  });
});
