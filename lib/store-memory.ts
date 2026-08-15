// In-memory backend — the first-class demo mode, not a fallback (see
// docs/adr/0002). Behaviour is identical to the original synchronous store:
// mutations live for the server process only; reset() restores the seed.
// Single-process means no merge races, so runMerge needs no retry here.
import { mergeClaims } from "./merge";
import { loadSeed, type StoreState } from "./seed";
import type { MergeRunResult, StoreBackend } from "./store-backend";
import type { ExtractedClaim, OperatorClaim } from "./types";

let state: StoreState = loadSeed();

function getClaimSync(id: string): OperatorClaim | undefined {
  return state.claims.find((c) => c.id === id);
}

export const memoryBackend: StoreBackend = {
  async getState(): Promise<StoreState> {
    return state;
  },

  async getClaim(id: string): Promise<OperatorClaim | undefined> {
    return getClaimSync(id);
  },

  // Superseded claims stay in the store for history but are excluded from
  // checklist generation and Ask-the-corridor context.
  async getActiveClaims(): Promise<OperatorClaim[]> {
    return state.claims.filter((c) => c.status !== "superseded");
  },

  async addClaim(claim: OperatorClaim): Promise<void> {
    state.claims.push(claim);
  },

  async updateClaim(
    id: string,
    patch: Partial<OperatorClaim>,
  ): Promise<OperatorClaim | undefined> {
    const claim = getClaimSync(id);
    if (!claim) return undefined;
    Object.assign(claim, patch);
    return claim;
  },

  async runMerge(extracted: ExtractedClaim[]): Promise<MergeRunResult> {
    const { log, claims } = mergeClaims(extracted, state.claims);
    state.claims = claims;
    return { log, claims, rules: state.rules };
  },

  async reset(): Promise<void> {
    state = loadSeed();
  },

  // No persistence, no trail.
  async logDebrief(): Promise<string | null> {
    return null;
  },

  async logMergeEvents(): Promise<void> {},

  async logAsk(): Promise<void> {},
};
