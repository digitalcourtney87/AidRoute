// Regression: ISSUE-002 — a failing Claude call (missing ANTHROPIC_API_KEY,
// API error status, timeout, or transport failure) surfaced the route
// fallbacks that blame the user's connection or phrasing instead of the
// server-side AI outage.
// Found by /qa on 2026-08-15 against https://www.aidroute.org
// Report (local, not committed): .gstack/qa-reports/qa-report-aidroute-org-2026-08-15.md
import { afterEach, describe, expect, it, vi } from "vitest";
import { callClaude } from "@/lib/anthropic";
import {
  AI_UNAVAILABLE_MESSAGE,
  isClaudeFailure,
  publicErrorMessage,
  STORE_UNAVAILABLE_MESSAGE,
} from "@/lib/store-errors";

describe("AI failure error copy", () => {
  it("classifies missing-key, API-status, timeout, and transport errors as Claude failures", () => {
    expect(
      isClaudeFailure(
        new Error(
          "ANTHROPIC_API_KEY is not set — copy .env.example to .env.local and add the key.",
        ),
      ),
    ).toBe(true);
    expect(
      isClaudeFailure(new Error('Claude API 401: {"type":"error"}')),
    ).toBe(true);
    expect(
      isClaudeFailure(new Error("Claude API call timed out after 30s")),
    ).toBe(true);
    expect(
      isClaudeFailure(new Error("Claude API request failed: fetch failed")),
    ).toBe(true);
  });

  it("does not blame the operator's connection or phrasing for an AI outage", () => {
    const message = publicErrorMessage(
      new Error("Claude API 401: authentication_error"),
      "Couldn't extract intel from that debrief just now. Check the connection and try again — or rephrase the account.",
    );
    expect(message).toBe(AI_UNAVAILABLE_MESSAGE);
    expect(message).not.toMatch(/rephrase|check the connection/i);
  });

  it("leaves model-output parse failures on the route fallback", () => {
    const fallback = "Couldn't reach the corridor brain just now — try again.";
    expect(
      publicErrorMessage(
        new Error("Model response is not valid JSON: nonsense…"),
        fallback,
      ),
    ).toBe(fallback);
  });

  it("cannot be spoofed by model output echoed inside other errors", () => {
    // parseModelJson embeds up to 120 chars of raw model output; a debrief
    // that steers the model into printing "Claude API" must not fake an
    // outage. The anchor pins classification to callClaude's own messages.
    expect(
      isClaudeFailure(
        new Error("Model response is not valid JSON: the Claude API is great…"),
      ),
    ).toBe(false);
  });

  it("keeps store failures winning over the Claude classification", () => {
    // This message matches BOTH classifiers (starts with "Claude API",
    // contains a store RPC marker), so it fails if the check order flips.
    expect(
      publicErrorMessage(
        new Error("Claude API 500: replace_claims failed"),
        "fallback",
      ),
    ).toBe(STORE_UNAVAILABLE_MESSAGE);
  });
});

// Drift guard: classify the errors callClaude ACTUALLY throws, not
// hand-copied literals — rewording a message in lib/anthropic.ts must fail
// here, not silently regress production copy to the blame-the-user fallback.
describe("isClaudeFailure against real callClaude errors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("classifies the missing-key error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const err = await callClaude({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isClaudeFailure(err)).toBe(true);
  });

  it("classifies a non-2xx API response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("upstream error", { status: 401 })),
    );
    const err = await callClaude({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isClaudeFailure(err)).toBe(true);
  });

  it("classifies a transport-level fetch failure", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const err = await callClaude({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isClaudeFailure(err)).toBe(true);
  });
});
