import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Live mode ON for the suite's default, so the live-path tests keep
    // exercising the live path (callClaude itself is always mocked — no test
    // ever reaches api.anthropic.com). Demo-mode tests stub these off per
    // test with vi.stubEnv.
    env: {
      AIDROUTE_LIVE_LLM: "on",
      ANTHROPIC_API_KEY: "test-key-never-used-callclaude-is-mocked",
    },
  },
});
