// Demo mode end to end at the route boundary (docs/adr/0005): with live mode
// off, no visitor input may reach the model, and nothing may come back as an
// error. lib/anthropic is deliberately NOT mocked here — global fetch is
// spied instead, so a gate that leaks shows up as a real outbound call to
// api.anthropic.com rather than a mock that quietly absorbs it. The key is
// stubbed to a plausible value for the same reason: the test must fail
// because the request was attempted, not because the key was missing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  getActiveClaims,
  getChecklistLeg,
  getState,
  logAsk,
  logDebrief,
  putChecklistLeg,
} from "@/lib/store";
import { POST as askPOST } from "@/app/api/ask/route";
import { POST as checklistPOST } from "@/app/api/checklist/route";
import { POST as extractPOST } from "@/app/api/extract/route";
import type { OfficialRule, OperatorClaim } from "@/lib/types";

vi.mock("@/lib/store", () => ({
  getActiveClaims: vi.fn(),
  getState: vi.fn(),
  getChecklistLeg: vi.fn(),
  putChecklistLeg: vi.fn(),
  logDebrief: vi.fn(),
  logAsk: vi.fn(),
}));

const FREE_TEXT_DEBRIEF =
  "Drove out last Tuesday with Marta and her brother, no idea which crossing.";
const FREE_TEXT_QUESTION = "Is the Dorohusk crossing open on Sundays?";

const CLAIM: OperatorClaim = {
  id: "UA-001",
  leg: "UA_ENTRY",
  source_class: "operator_reported",
  claim: "Border guards ask for the cargo manifest in duplicate.",
  entities: {},
  date_observed: "2026-07",
  last_verified: "2026-07",
  first_person: true,
  hearsay: false,
  confidence: "high",
  status: "single_report",
  n_reports: 1,
};

const RULE: OfficialRule = {
  id: "OFF-UA-001",
  leg: "UA_ENTRY",
  source_class: "official",
  claim: "Humanitarian cargo requires a customs declaration.",
  authority: "UA Customs",
  published: "2026-01",
  last_verified: "2026-06",
  confidence: "high",
};

function post(route: string, body: unknown, forceLive = false): Request {
  return new Request(`http://localhost${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(forceLive ? { "x-force-live": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

let fetchSpy: MockInstance<typeof globalThis.fetch>;

beforeEach(() => {
  vi.clearAllMocks();
  // Demo mode: the flag off while a key IS present — the configuration the
  // deployment must be safe in even if a key is re-added by accident.
  vi.stubEnv("AIDROUTE_LIVE_LLM", undefined);
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-looks-real-enough");
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("no network in tests"));
  vi.mocked(getActiveClaims).mockResolvedValue([CLAIM]);
  vi.mocked(getState).mockResolvedValue({ claims: [CLAIM], rules: [RULE] });
  vi.mocked(getChecklistLeg).mockResolvedValue(null);
  vi.mocked(putChecklistLeg).mockResolvedValue(undefined);
  vi.mocked(logDebrief).mockResolvedValue(null);
  vi.mocked(logAsk).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function expectNoAnthropicCall() {
  const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
  expect(urls.filter((u) => u.includes("api.anthropic.com"))).toEqual([]);
}

describe("POST /api/extract in demo mode", () => {
  it("answers a free-typed debrief with the demo-only notice, not an error", async () => {
    const res = await extractPOST(post("/api/extract", { text: FREE_TEXT_DEBRIEF }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demo_only).toBe(true);
    expect(body.message).toMatch(/sample debrief/i);
    expectNoAnthropicCall();
  });

  // §3.4: a visitor may type real names and places into "Tell us about the
  // trip". Demo mode must not keep any of it.
  it("persists nothing a visitor typed", async () => {
    await extractPOST(post("/api/extract", { text: FREE_TEXT_DEBRIEF }));

    expect(logDebrief).not.toHaveBeenCalled();
    expect(getActiveClaims).not.toHaveBeenCalled();
  });

  it("still serves the canned fixture", async () => {
    const res = await extractPOST(
      post("/api/extract", {
        text: "Just back from our August run, two vans via the tunnel. The customs company tried to talk us into a bulk declaration again to save money — we insisted on line-by-line.",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canned).toBe(true);
    expectNoAnthropicCall();
  });

  it("ignores x-force-live", async () => {
    const res = await extractPOST(
      post("/api/extract", { text: FREE_TEXT_DEBRIEF }, true),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).demo_only).toBe(true);
    expectNoAnthropicCall();
  });
});

describe("POST /api/ask in demo mode", () => {
  it("answers a free-typed question with the demo-only notice, not an error", async () => {
    const res = await askPOST(post("/api/ask", { question: FREE_TEXT_QUESTION }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demo_only).toBe(true);
    expect(body.message).toMatch(/suggested questions/i);
    expectNoAnthropicCall();
  });

  it("persists nothing a visitor typed", async () => {
    await askPOST(post("/api/ask", { question: FREE_TEXT_QUESTION }));

    expect(logAsk).not.toHaveBeenCalled();
    expect(getActiveClaims).not.toHaveBeenCalled();
  });

  it("still serves a canned chip question", async () => {
    const res = await askPOST(
      post("/api/ask", { question: "Does the T1 need every item listed?" }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).canned).toBe(true);
    expectNoAnthropicCall();
  });

  it("ignores x-force-live", async () => {
    const res = await askPOST(
      post("/api/ask", { question: "Does the T1 need every item listed?" }, true),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).canned).toBe(true);
    expectNoAnthropicCall();
  });
});

describe("POST /api/checklist in demo mode", () => {
  it("returns a demo-only section instead of generating a leg", async () => {
    const res = await checklistPOST(post("/api/checklist", { legs: ["UA_ENTRY"] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.legs).toHaveLength(1);
    expect(body.legs[0].demo_only).toBe(true);
    expect(body.legs[0].leg).toBe("UA_ENTRY");
    expect(body.legs[0].items).toEqual([]);
    expect(body.legs[0].message).toMatch(/sample debrief/i);
    expectNoAnthropicCall();
  });

  it("caches nothing for a demo-only section", async () => {
    await checklistPOST(post("/api/checklist", { legs: ["UA_ENTRY"] }));

    expect(putChecklistLeg).not.toHaveBeenCalled();
  });

  it("still serves a cached section", async () => {
    vi.mocked(getChecklistLeg).mockResolvedValue({
      leg: "UA_ENTRY",
      title: "Ukraine — entry",
      items: [
        { text: "Carry the manifest.", type: "carry", source_ids: ["UA-001"] },
      ],
    });

    const res = await checklistPOST(post("/api/checklist", { legs: ["UA_ENTRY"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.legs[0].items).toHaveLength(1);
    expect(body.legs[0].demo_only).toBeUndefined();
    expectNoAnthropicCall();
  });

  it("ignores x-force-live", async () => {
    const res = await checklistPOST(
      post("/api/checklist", { legs: ["UA_ENTRY"] }, true),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).legs[0].demo_only).toBe(true);
    expectNoAnthropicCall();
  });

  // An empty leg is still an honest gap, not a demo-mode limitation.
  it("keeps the honest-gap section for a leg with no intel", async () => {
    vi.mocked(getState).mockResolvedValue({ claims: [], rules: [] });

    const res = await checklistPOST(post("/api/checklist", { legs: ["UA_ENTRY"] }));
    const body = await res.json();

    expect(body.legs[0].gap).toBe(true);
    expect(body.legs[0].demo_only).toBeUndefined();
  });
});
