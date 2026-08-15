// The store contract both backends implement. All methods are async so the
// in-memory and Supabase implementations are interchangeable behind
// lib/store.ts; the in-memory one resolves instantly.
import type { AskResponse } from "./ask";
import type { ChecklistLeg } from "./checklist";
import type { StoreState } from "./seed";
import type {
  ExtractedClaim,
  Leg,
  MergeResult,
  OfficialRule,
  OperatorClaim,
} from "./types";

// runMerge returns rules too so callers get the whole response payload from
// the same load the merge ran against (one round trip on the DB backend).
export interface MergeRunResult {
  log: MergeResult;
  claims: OperatorClaim[];
  rules: OfficialRule[];
}

export interface StoreBackend {
  getState(): Promise<StoreState>;
  getClaim(id: string): Promise<OperatorClaim | undefined>;
  getActiveClaims(): Promise<OperatorClaim[]>;
  addClaim(claim: OperatorClaim): Promise<void>;
  updateClaim(
    id: string,
    patch: Partial<OperatorClaim>,
  ): Promise<OperatorClaim | undefined>;
  // Load → pure mergeClaims() → write back, atomically per backend.
  runMerge(extracted: ExtractedClaim[]): Promise<MergeRunResult>;
  reset(): Promise<void>;

  // Checklist cache — one generated section per (store fingerprint, leg).
  // Best-effort like the trail: a cache failure must degrade to a live
  // generation (get → null) or a lost entry (put), never a failed request.
  getChecklistLeg(fingerprint: string, leg: Leg): Promise<ChecklistLeg | null>;
  putChecklistLeg(
    fingerprint: string,
    leg: Leg,
    section: ChecklistLeg,
  ): Promise<void>;

  // Capture trail — append-only, never read by the app, no-ops in memory
  // mode. Failures must be swallowed by implementations: losing a trail row
  // must never fail the user-facing request.
  logDebrief(rawText: string, extracted: ExtractedClaim[]): Promise<string | null>;
  logMergeEvents(log: MergeResult, debriefId: string | null): Promise<void>;
  logAsk(question: string, response: AskResponse): Promise<void>;
}
