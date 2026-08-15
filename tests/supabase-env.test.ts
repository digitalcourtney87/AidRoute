import { describe, expect, it, vi } from "vitest";
import {
  hasSupabaseEnv,
  parseServiceRoleKey,
  readSupabaseEnv,
  redactSecrets,
} from "@/lib/supabase-env";

// Shape-valid stand-in — not a real credential. Matches the production
// failure: the same JWT pasted three times with newlines, third copy truncated.
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig";

describe("parseServiceRoleKey", () => {
  it("returns a header-safe JWT from a duplicated Vercel paste", () => {
    const duplicated = `${JWT}\n${JWT}\n${JWT.slice(1)}`;
    const { key, discardedExtra } = parseServiceRoleKey(duplicated);
    expect(key).toBe(JWT);
    expect(discardedExtra).toBe(true);
    expect(() =>
      new Headers().set("Authorization", `Bearer ${key}`),
    ).not.toThrow();
  });

  it("reproduces the production Headers.set failure on the unsanitized value", () => {
    const duplicated = `${JWT}\n${JWT}\n${JWT.slice(1)}`;
    expect(() =>
      new Headers().set("Authorization", `Bearer ${duplicated}`),
    ).toThrow(/invalid header value/i);
  });

  it("trims a well-formed single-line key", () => {
    expect(parseServiceRoleKey(`  ${JWT}  \n`)).toEqual({
      key: JWT,
      discardedExtra: false,
    });
  });

  it("returns null for empty or non-JWT values", () => {
    expect(parseServiceRoleKey(undefined).key).toBeNull();
    expect(parseServiceRoleKey("   \n").key).toBeNull();
    expect(parseServiceRoleKey("not-a-jwt").key).toBeNull();
  });
});

describe("readSupabaseEnv", () => {
  it("trims the URL and warns once extra key tokens are discarded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = {
      SUPABASE_URL: " https://example.supabase.co\n",
      SUPABASE_SERVICE_ROLE_KEY: `${JWT}\n${JWT}`,
    };
    expect(readSupabaseEnv(env)).toEqual({
      url: "https://example.supabase.co",
      key: JWT,
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("throws a secret-free error when the key is unusable", () => {
    expect(() =>
      readSupabaseEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "garbage\ngarbage",
      }),
    ).toThrow(/not usable/i);
  });
});

describe("hasSupabaseEnv", () => {
  it("is true only when both values are non-empty after trim", () => {
    expect(hasSupabaseEnv({})).toBe(false);
    expect(
      hasSupabaseEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "\n",
      }),
    ).toBe(false);
    expect(
      hasSupabaseEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: JWT,
      }),
    ).toBe(true);
  });
});

describe("redactSecrets", () => {
  it("strips JWTs and newlines from a Headers.set TypeError", () => {
    const message = `Headers.set: "${JWT}\n${JWT}" is an invalid header value.`;
    const redacted = redactSecrets(message);
    expect(redacted).not.toContain(JWT);
    expect(redacted).not.toMatch(/[\r\n]/);
    expect(redacted).toContain("[redacted-jwt]");
  });
});
