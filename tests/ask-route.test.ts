import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveClaims, getState, logAsk } from "@/lib/store";
import { callClaude } from "@/lib/anthropic";
import { POST } from "@/app/api/ask/route";

vi.mock("@/lib/store", () => ({
  getActiveClaims: vi.fn(),
  getState: vi.fn(),
  logAsk: vi.fn(),
}));
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  callClaude: vi.fn(),
}));

function post(question: string): Request {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(logAsk).mockResolvedValue(undefined);
});

describe("POST /api/ask", () => {
  it("returns the crafted 422 JSON when the store read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getActiveClaims).mockRejectedValue(
      new Error("get_corridor_state failed: supabase unreachable"),
    );

    const res = await POST(post("Unrehearsed question about a crossing?"));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/corridor store is unavailable/i);
  });

  it("serves a canned chip question without reading the claim store", async () => {
    const res = await POST(post("Which Polish crossing should we use?"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canned).toBe(true);
    expect(getActiveClaims).not.toHaveBeenCalled();
  });

  it("returns the AI-outage copy when the Claude call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getActiveClaims).mockResolvedValue([]);
    vi.mocked(getState).mockResolvedValue({ claims: [], rules: [] } as never);
    vi.mocked(callClaude).mockRejectedValue(
      new Error("Claude API 401: authentication_error"),
    );

    const res = await POST(post("Unrehearsed question about a crossing?"));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/AI service is unavailable/i);
  });
});
