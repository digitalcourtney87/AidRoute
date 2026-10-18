import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LiveLlmUnavailableError,
  callClaude,
  parseModelJson,
  stripJsonFences,
} from "@/lib/anthropic";

describe("stripJsonFences", () => {
  it("passes plain JSON through untouched", () => {
    expect(stripJsonFences('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it("strips ```json fences", () => {
    expect(stripJsonFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("strips bare ``` fences", () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("parseModelJson", () => {
  it("parses a fenced JSON array", () => {
    expect(parseModelJson<number[]>("```json\n[1,2,3]\n```")).toEqual([1, 2, 3]);
  });

  it("recovers JSON wrapped in stray prose", () => {
    expect(
      parseModelJson<{ ok: boolean }>('Here is the result:\n{"ok": true}\nDone.'),
    ).toEqual({ ok: true });
  });

  it("throws a descriptive error on unparseable content", () => {
    expect(() => parseModelJson("no json here at all")).toThrow(/JSON/);
  });
});

// Defence in depth (docs/adr/0005 §3.3): a missing, stale or revoked key is a
// configuration fact, not a visitor's fault. It must surface as a typed error
// the routes can turn into the demo-only notice — never as a red error.
describe("callClaude key handling", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws LiveLlmUnavailableError, without a request, when no key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(callClaude({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      LiveLlmUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws LiveLlmUnavailableError when the key is rejected with 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("authentication_error", { status: 401 }),
    );

    await expect(callClaude({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      LiveLlmUnavailableError,
    );
  });

  it("throws LiveLlmUnavailableError when the key is rejected with 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("permission_error", { status: 403 }),
    );

    await expect(callClaude({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      LiveLlmUnavailableError,
    );
  });

  // A 500 from Anthropic is a transient upstream failure, not a dead key —
  // it stays a plain error so the route still says "try again".
  it("throws a plain error on a non-auth API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("overloaded", { status: 500 }),
    );

    const err = await callClaude({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(LiveLlmUnavailableError);
    expect(err.message).toMatch(/Claude API 500/);
  });
});
