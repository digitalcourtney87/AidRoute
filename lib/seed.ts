// Single source of truth for seed state: data/seed-data.json, read from disk
// (not import-attributed) so plain Node scripts can share this module. Both
// backends and scripts/db-seed.ts seed through here — no second copy in SQL.
import { readFileSync } from "node:fs";
import path from "node:path";
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

export function loadSeed(): StoreState {
  const seed = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "seed-data.json"), "utf8"),
  ) as {
    official_rules: OfficialRule[];
    operator_claims: Array<Omit<OperatorClaim, "entities"> & { entities: RawEntities }>;
  };
  return {
    claims: seed.operator_claims.map((c) => ({
      ...c,
      entities: normaliseEntities(c.entities),
    })),
    rules: seed.official_rules,
  };
}
