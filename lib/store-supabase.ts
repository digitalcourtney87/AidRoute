// Supabase backend — selected by lib/store.ts only when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set. All access is server-side with the
// service role; RLS is deny-all so nothing is reachable any other way.
//
// Write pattern: load state + version → pure mergeClaims() in Node → atomic
// replace_claims RPC guarded by optimistic version check, retried on
// contention. The merge engine itself never changes between backends.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AskResponse } from "./ask";
import { mergeClaims } from "./merge";
import { loadSeed, type StoreState } from "./seed";
import type { MergeRunResult, StoreBackend } from "./store-backend";
import type {
  ExtractedClaim,
  MergeResult,
  OfficialRule,
  OperatorClaim,
} from "./types";

const MERGE_RETRIES = 5;

// Postgres rows carry null where the TS types use optional/absent fields;
// strip nulls so downstream `?? []` / truthiness checks behave identically
// to the in-memory backend.
function stripNulls<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) out[key] = value;
  }
  return out as T;
}

interface VersionedState extends StoreState {
  version: number;
}

export function createSupabaseBackend(): StoreBackend {
  const client: SupabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  async function loadVersioned(): Promise<VersionedState> {
    const { data, error } = await client.rpc("get_corridor_state");
    if (error) throw new Error(`get_corridor_state failed: ${error.message}`);
    const raw = data as {
      version: number;
      claims: Record<string, unknown>[];
      rules: Record<string, unknown>[];
    };
    return {
      version: raw.version,
      claims: (raw.claims ?? []).map((r) => stripNulls<OperatorClaim>(r)),
      rules: (raw.rules ?? []).map((r) => stripNulls<OfficialRule>(r)),
    };
  }

  async function replaceClaims(
    expectedVersion: number,
    claims: OperatorClaim[],
  ): Promise<boolean> {
    const { error } = await client.rpc("replace_claims", {
      expected_version: expectedVersion,
      new_claims: claims,
    });
    if (!error) return true;
    // The RPC raises serialization_failure (40001) on a stale version.
    if (error.code === "40001" || error.message.includes("version_conflict")) {
      return false;
    }
    throw new Error(`replace_claims failed: ${error.message}`);
  }

  return {
    async getState(): Promise<StoreState> {
      const { claims, rules } = await loadVersioned();
      return { claims, rules };
    },

    async getClaim(id: string): Promise<OperatorClaim | undefined> {
      const { claims } = await loadVersioned();
      return claims.find((c) => c.id === id);
    },

    async getActiveClaims(): Promise<OperatorClaim[]> {
      const { claims } = await loadVersioned();
      return claims.filter((c) => c.status !== "superseded");
    },

    async addClaim(claim: OperatorClaim): Promise<void> {
      const { error } = await client.from("operator_claims").insert(claim);
      if (error) throw new Error(`addClaim failed: ${error.message}`);
    },

    async updateClaim(
      id: string,
      patch: Partial<OperatorClaim>,
    ): Promise<OperatorClaim | undefined> {
      const { data, error } = await client
        .from("operator_claims")
        .update(patch)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw new Error(`updateClaim failed: ${error.message}`);
      return data ? stripNulls<OperatorClaim>(data) : undefined;
    },

    async runMerge(extracted: ExtractedClaim[]): Promise<MergeRunResult> {
      for (let attempt = 0; attempt < MERGE_RETRIES; attempt += 1) {
        const { version, claims, rules } = await loadVersioned();
        const { log, claims: merged } = mergeClaims(extracted, claims);
        if (await replaceClaims(version, merged)) {
          return { log, claims: merged, rules };
        }
        // Someone else merged first — reload and re-run the pure merge.
      }
      throw new Error(
        `merge contention: gave up after ${MERGE_RETRIES} attempts`,
      );
    },

    async reset(): Promise<void> {
      const seed = loadSeed();
      const { error } = await client.rpc("reset_corridor", {
        seed_claims: seed.claims,
        seed_rules: seed.rules,
      });
      if (error) throw new Error(`reset_corridor failed: ${error.message}`);
    },

    // Trail writes are best-effort by contract (store-backend.ts): a lost
    // trail row must never fail the user-facing request.
    async logDebrief(
      rawText: string,
      extracted: ExtractedClaim[],
    ): Promise<string | null> {
      const { data, error } = await client
        .from("debriefs")
        .insert({ raw_text: rawText, extracted })
        .select("id")
        .single();
      if (error) {
        console.error("trail: logDebrief failed:", error.message);
        return null;
      }
      return data.id as string;
    },

    async logMergeEvents(
      log: MergeResult,
      debriefId: string | null,
    ): Promise<void> {
      if (log.length === 0) return;
      const rows = log.map((entry) => ({
        debrief_id: debriefId,
        action: entry.action,
        target_id: entry.targetId ?? null,
        extracted: entry.extracted,
      }));
      const { error } = await client.from("merge_events").insert(rows);
      if (error) console.error("trail: logMergeEvents failed:", error.message);
    },

    async logAsk(question: string, response: AskResponse): Promise<void> {
      const { error } = await client.from("ask_logs").insert({
        question,
        answer: response.answer,
        gap: response.no_verified_intel,
        citations: response.cited_ids,
      });
      if (error) console.error("trail: logAsk failed:", error.message);
    },
  };
}
