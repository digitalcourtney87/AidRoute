// Regression: ISSUE-002 — a failing Claude call (missing ANTHROPIC_API_KEY,
// API error status, or timeout) surfaced the route fallbacks that blame the
// user's connection or phrasing instead of the server-side AI outage.
// Found by /qa on 2026-08-15 against https://www.aidroute.org
// Report: .gstack/qa-reports/qa-report-aidroute-org-2026-08-15.md
import { describe, expect, it } from "vitest";
import {
  AI_UNAVAILABLE_MESSAGE,
  isClaudeFailure,
  publicErrorMessage,
  STORE_UNAVAILABLE_MESSAGE,
} from "@/lib/store-errors";

describe("AI failure error copy", () => {
  it("classifies missing-key, API-status, and timeout errors as Claude failures", () => {
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

  it("keeps store failures winning over the Claude classification", () => {
    expect(
      publicErrorMessage(
        new Error("get_corridor_state failed: boom"),
        "fallback",
      ),
    ).toBe(STORE_UNAVAILABLE_MESSAGE);
  });
});
