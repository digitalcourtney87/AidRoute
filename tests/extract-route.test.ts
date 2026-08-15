// The /api/extract route contract: every failure mode must come back as the
// route's crafted JSON error — never an unhandled rejection, which Next turns
// into a raw 500 HTML page the client's res.json() chokes on. Store and
// Anthropic are mocked so these tests exercise the route, not the backends.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveClaims, logDebrief } from "@/lib/store";
import { callClaude } from "@/lib/anthropic";
import { POST } from "@/app/api/extract/route";

vi.mock("@/lib/store", () => ({
  getActiveClaims: vi.fn(),
  logDebrief: vi.fn(),
}));
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  callClaude: vi.fn(),
}));

function post(text: string): Request {
  return new Request("http://localhost/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

const VALID_EXTRACTION = JSON.stringify([
  {
    claim: "The third crossing now wants the T1 itemised line by line.",
    leg: "PL_ENTRY",
    entities: { forms: ["T1"] },
    date_observed: "2026-08",
    first_person: true,
    hearsay: false,
    confidence: "medium",
    verbatim_quote: "they wanted the T1 line by line",
    matches_existing_id: null,
    relation_if_match: null,
  },
]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(logDebrief).mockResolvedValue(null);
});

describe("POST /api/extract", () => {
  it("returns the crafted 422 JSON when the store read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getActiveClaims).mockRejectedValue(
      new Error("supabase unreachable"),
    );

    const res = await POST(post("Unrehearsed debrief about an August run."));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/try again/i);
  });

  it("extracts via the live path when the store is healthy", async () => {
    vi.mocked(getActiveClaims).mockResolvedValue([]);
    vi.mocked(callClaude).mockResolvedValue(VALID_EXTRACTION);

    const res = await POST(post("Unrehearsed debrief about an August run."));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.extracted).toHaveLength(1);
    expect(body.extracted[0].leg).toBe("PL_ENTRY");
  });

  it("serves canned demo input without reading the claim store", async () => {
    // The canned fast path intentionally skips getActiveClaims — the
    // rehearsed demo must work even with the store misconfigured.
    const { input_startswith } = JSON.parse(
      readFileSync("data/canned/extraction.json", "utf8"),
    ) as { input_startswith: string };

    const res = await POST(post(`${input_startswith} rest of the account.`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canned).toBe(true);
    expect(getActiveClaims).not.toHaveBeenCalled();
  });
});
