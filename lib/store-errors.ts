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

// A missing/invalid ANTHROPIC_API_KEY, a Claude API error status or timeout,
// or a transport failure reaching the API (callClaude wraps those) —
// server-side conditions the operator can't fix by rephrasing. Anchored to
// the message start so model-controlled text echoed inside other errors
// (e.g. parse failures) can't spoof the classification.
export function isClaudeFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /^(Claude API|ANTHROPIC_API_KEY)/i.test(msg);
}

export function publicErrorMessage(err: unknown, fallback: string): string {
  if (isStoreFailure(err)) return STORE_UNAVAILABLE_MESSAGE;
  if (isClaudeFailure(err)) return AI_UNAVAILABLE_MESSAGE;
  return fallback;
}
