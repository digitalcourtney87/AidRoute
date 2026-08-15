// In-memory claim store seeded from data/seed-data.json. No database by design:
// mutations live for the server process only; reset() restores the seed.
import seedJson from "../data/seed-data.json";
import type { OfficialRule, OperatorClaim } from "./types";

export interface StoreState {
  claims: OperatorClaim[];
  rules: OfficialRule[];
}

// The seed file is consumed, never modified. Its entity values are sometimes a
// bare string (e.g. route_point) where the handoff types say string[] — we
// normalise to string[] here so the merge engine can rely on one shape.
type RawEntities = Record<string, string | string[]>;

function normaliseEntities(raw: RawEntities): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = Array.isArray(value) ? value : [value];
  }
  return out;
}

function freshState(): StoreState {
  const seed = seedJson as unknown as {
    official_rules: OfficialRule[];
    operator_claims: Array<Omit<OperatorClaim, "entities"> & { entities: RawEntities }>;
  };
  return {
    claims: seed.operator_claims.map((c) => ({
      ...structuredClone(c),
      entities: normaliseEntities(c.entities),
    })),
    rules: structuredClone(seed.official_rules),
  };
}

let state: StoreState = freshState();

export function getState(): StoreState {
  return state;
}

export function getClaim(id: string): OperatorClaim | undefined {
  return state.claims.find((c) => c.id === id);
}

// Superseded claims stay in the store for history but are excluded from
// checklist generation and Ask-the-corridor context.
export function getActiveClaims(): OperatorClaim[] {
  return state.claims.filter((c) => c.status !== "superseded");
}

export function addClaim(claim: OperatorClaim): void {
  state.claims.push(claim);
}

export function updateClaim(
  id: string,
  patch: Partial<OperatorClaim>,
): OperatorClaim | undefined {
  const claim = getClaim(id);
  if (!claim) return undefined;
  Object.assign(claim, patch);
  return claim;
}

export function reset(): void {
  state = freshState();
}
