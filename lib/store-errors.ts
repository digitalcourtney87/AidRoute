export const STORE_UNAVAILABLE_MESSAGE =
  "The corridor store is unavailable right now. This isn't a problem with what you typed — try again shortly.";

export function isStoreFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /get_corridor_state|replace_claims|addClaim failed|updateClaim failed|reset_corridor|SUPABASE_|Headers\.set/i.test(
    msg,
  );
}

export function publicErrorMessage(err: unknown, fallback: string): string {
  return isStoreFailure(err) ? STORE_UNAVAILABLE_MESSAGE : fallback;
}
