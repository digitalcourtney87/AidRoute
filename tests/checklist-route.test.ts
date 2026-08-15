import { beforeEach, describe, expect, it, vi } from "vitest";
import { callClaude } from "@/lib/anthropic";
import { getChecklistLeg, getState, putChecklistLeg } from "@/lib/store";
import { POST } from "@/app/api/checklist/route";
import type { OfficialRule, OperatorClaim } from "@/lib/types";

vi.mock("@/lib/store", () => ({
  getState: vi.fn(),
  getChecklistLeg: vi.fn(),
  putChecklistLeg: vi.fn(),
}));
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  callClaude: vi.fn(),
}));

function post(body: unknown = {}): Request {
  return new Request("http://localhost/api/checklist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getChecklistLeg).mockResolvedValue(null);
  vi.mocked(putChecklistLeg).mockResolvedValue(undefined);
});

describe("POST /api/checklist", () => {
  it("returns the crafted 422 JSON when the store read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getState).mockRejectedValue(
      new Error("get_corridor_state failed: supabase unreachable"),
    );

    const res = await POST(post());

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/corridor store is unavailable/i);
  });

  it("rejects a span that covers no legs", async () => {
    vi.mocked(getState).mockResolvedValue({ claims: [], rules: [] });

    const res = await POST(post({ legs: [] }));

    expect(res.status).toBe(400);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("generates only the requested leg and caches the result", async () => {
    vi.mocked(getState).mockResolvedValue({ claims: [CLAIM], rules: [RULE] });
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        leg: "UA_ENTRY",
        title: "Ukraine — entry",
        items: [
          {
            text: "Carry the cargo manifest in duplicate.",
            type: "carry",
            source_ids: ["UA-001"],
          },
        ],
      }),
    );

    const res = await POST(post({ legs: ["UA_ENTRY"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(callClaude).toHaveBeenCalledTimes(1);
    expect(body.legs).toHaveLength(1);
    expect(body.legs[0].leg).toBe("UA_ENTRY");
    expect(body.legs[0].items[0].source_ids).toEqual(["UA-001"]);
    expect(putChecklistLeg).toHaveBeenCalledWith(
      expect.any(String),
      "UA_ENTRY",
      expect.objectContaining({ leg: "UA_ENTRY" }),
    );
  });

  it("serves a cached section without calling the model", async () => {
    vi.mocked(getState).mockResolvedValue({ claims: [CLAIM], rules: [RULE] });
    vi.mocked(getChecklistLeg).mockResolvedValue({
      leg: "UA_ENTRY",
      title: "Ukraine — entry",
      items: [
        { text: "Carry the manifest.", type: "carry", source_ids: ["UA-001"] },
      ],
    });

    const res = await POST(post({ legs: ["UA_ENTRY"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(callClaude).not.toHaveBeenCalled();
    expect(body.legs[0].items).toHaveLength(1);
  });

  // An honest gap is the product working as designed — never ask the model to
  // compose a section out of nothing.
  it("returns a gap section without a model call when the leg has no intel", async () => {
    vi.mocked(getState).mockResolvedValue({ claims: [], rules: [] });

    const res = await POST(post({ legs: ["UA_ENTRY"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(callClaude).not.toHaveBeenCalled();
    expect(body.legs[0].gap).toBe(true);
    expect(body.legs[0].items).toEqual([]);
    expect(putChecklistLeg).not.toHaveBeenCalled();
  });

  it("drops uncited lines rather than rendering them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getState).mockResolvedValue({ claims: [CLAIM], rules: [RULE] });
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        leg: "UA_ENTRY",
        title: "Ukraine — entry",
        items: [
          { text: "Carry the manifest.", type: "carry", source_ids: ["UA-001"] },
          { text: "Bring €500 in cash.", type: "carry", source_ids: ["XX-999"] },
        ],
      }),
    );

    const res = await POST(post({ legs: ["UA_ENTRY"] }));
    const body = await res.json();

    expect(body.legs[0].items).toHaveLength(1);
    expect(body.dropped).toBe(1);
  });
});
