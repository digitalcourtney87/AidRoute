// Vercel env values are pasted into a textarea. A duplicated paste or a
// trailing newline makes SUPABASE_SERVICE_ROLE_KEY contain CR/LF, and
// Headers.set then rejects the Authorization value before any RPC runs —
// which is exactly how production went down on 2026-08-15.
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function parseServiceRoleKey(raw: string | undefined): {
  key: string | null;
  discardedExtra: boolean;
} {
  if (!raw) return { key: null, discardedExtra: false };
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { key: null, discardedExtra: false };
  const jwt = tokens.find((token) => JWT_RE.test(token)) ?? null;
  return { key: jwt, discardedExtra: jwt !== null && tokens.length > 1 };
}

type Env = Record<string, string | undefined>;

export function readSupabaseEnv(
  env: Env = process.env,
): { url: string; key: string } {
  const url = (env.SUPABASE_URL ?? "").trim();
  const { key, discardedExtra } = parseServiceRoleKey(
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (discardedExtra) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY contained extra whitespace or duplicated values; using the first JWT.",
    );
  }
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set but not usable. Paste each value once, with no extra lines.",
    );
  }
  return { url, key };
}

export function hasSupabaseEnv(env: Env = process.env): boolean {
  return Boolean(
    env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

// Never interpolate the raw key into logs or thrown errors — Headers.set's
// TypeError includes the whole invalid header value, which is the secret.
export function redactSecrets(text: string): string {
  return text
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted-jwt]",
    )
    .replace(/[\r\n]+/g, " ");
}
