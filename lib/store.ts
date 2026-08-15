// The claim store facade. Two interchangeable backends (docs/adr/0002):
//
//   - in-memory (default): the offline rehearsed-demo mode — no env vars, no
//     network, byte-identical to the original synchronous store
//   - Supabase: selected when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
//     set — persistent, safe under concurrent merges, with a capture trail
//
// Every truth decision still lives in the pure merge engine (lib/merge.ts);
// backends only load and persist what it returns.
import type { AskResponse } from "./ask";
import type { StoreState } from "./seed";
import type { MergeRunResult, StoreBackend } from "./store-backend";
import { memoryBackend } from "./store-memory";
import { createSupabaseBackend } from "./store-supabase";
import type { ExtractedClaim, MergeResult, OperatorClaim } from "./types";

export type { StoreState } from "./seed";
export type { MergeRunResult } from "./store-backend";

export const persistent = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const backend: StoreBackend = persistent
  ? createSupabaseBackend()
  : memoryBackend;

export function getState(): Promise<StoreState> {
  return backend.getState();
}

export function getClaim(id: string): Promise<OperatorClaim | undefined> {
  return backend.getClaim(id);
}

export function getActiveClaims(): Promise<OperatorClaim[]> {
  return backend.getActiveClaims();
}

export function addClaim(claim: OperatorClaim): Promise<void> {
  return backend.addClaim(claim);
}

export function updateClaim(
  id: string,
  patch: Partial<OperatorClaim>,
): Promise<OperatorClaim | undefined> {
  return backend.updateClaim(id, patch);
}

export function runMerge(extracted: ExtractedClaim[]): Promise<MergeRunResult> {
  return backend.runMerge(extracted);
}

export function reset(): Promise<void> {
  return backend.reset();
}

export function logDebrief(
  rawText: string,
  extracted: ExtractedClaim[],
): Promise<string | null> {
  return backend.logDebrief(rawText, extracted);
}

export function logMergeEvents(
  log: MergeResult,
  debriefId: string | null,
): Promise<void> {
  return backend.logMergeEvents(log, debriefId);
}

export function logAsk(question: string, response: AskResponse): Promise<void> {
  return backend.logAsk(question, response);
}
