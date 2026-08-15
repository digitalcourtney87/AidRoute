export const STORE_UNAVAILABLE_MESSAGE =
  "The corridor store is unavailable right now. This isn't a problem with what you typed — try again shortly.";

export const AI_UNAVAILABLE_MESSAGE =
  "The corridor's AI service is unavailable right now. This isn't a problem with what you typed — try again shortly, and tell the site operator if it persists.";

export function isStoreFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /get_corridor_state|replace_claims|addClaim failed|updateClaim failed|reset_corridor|SUPABASE_|Headers\.set/i.test(
    msg,
  );
}

// A missing/invalid ANTHROPIC_API_KEY, a Claude API error status, or a Claude
// timeout — server-side conditions the operator can't fix by rephrasing.
export function isClaudeFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ANTHROPIC_API_KEY|Claude API/i.test(msg);
}

export function publicErrorMessage(err: unknown, fallback: string): string {
  if (isStoreFailure(err)) return STORE_UNAVAILABLE_MESSAGE;
  if (isClaudeFailure(err)) return AI_UNAVAILABLE_MESSAGE;
  return fallback;
}
