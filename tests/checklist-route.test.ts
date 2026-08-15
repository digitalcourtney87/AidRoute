import { beforeEach, describe, expect, it, vi } from "vitest";
import { getState } from "@/lib/store";
import { POST } from "@/app/api/checklist/route";

vi.mock("@/lib/store", () => ({
  getState: vi.fn(),
}));
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  callClaude: vi.fn(),
}));

function post(): Request {
  return new Request("http://localhost/api/checklist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
