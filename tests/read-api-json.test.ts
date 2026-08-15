import { describe, expect, it } from "vitest";
import { readApiJson } from "@/lib/read-api-json";

describe("readApiJson", () => {
  it("does not throw Unexpected end of JSON input on an empty 500", async () => {
    const res = new Response("", { status: 500 });
    await expect(readApiJson(res)).rejects.toThrow(/try again/i);
  });

  it("surfaces the route's error field on a JSON 422", async () => {
    const res = new Response(
      JSON.stringify({ error: "The corridor store is unavailable right now." }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
    await expect(readApiJson(res)).rejects.toThrow(/corridor store/i);
  });

  it("returns the parsed body on 200", async () => {
    const res = new Response(JSON.stringify({ answer: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(readApiJson<{ answer: string }>(res)).resolves.toEqual({
      answer: "ok",
    });
  });
});
