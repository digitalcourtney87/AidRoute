// The public deployment must not be one forgotten env var away from spending
// money: live calls need an explicit opt-in flag AND a key, so re-adding a
// key to Vercel by accident cannot reopen the live path (docs/adr/0005).
import { afterEach, describe, expect, it, vi } from "vitest";
import { isLiveLlmEnabled } from "@/lib/live-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLiveLlmEnabled", () => {
  it("is off with neither the flag nor a key", () => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    expect(isLiveLlmEnabled()).toBe(false);
  });

  it("is off with a key but no flag", () => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-whatever");
    expect(isLiveLlmEnabled()).toBe(false);
  });

  it("is off with the flag but no key", () => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", "on");
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    expect(isLiveLlmEnabled()).toBe(false);
  });

  it("is on with both the flag and a key", () => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", "on");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-whatever");
    expect(isLiveLlmEnabled()).toBe(true);
  });

  it("treats any value other than \"on\" as off", () => {
    vi.stubEnv("AIDROUTE_LIVE_LLM", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-whatever");
    expect(isLiveLlmEnabled()).toBe(false);
  });
});
