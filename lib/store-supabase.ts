// Supabase backend — selected by lib/store.ts only when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set. All access is server-side with the
// service role; RLS is deny-all so nothing is reachable any other way.
//
// Write pattern: load state + version → pure mergeClaims() in Node → atomic
// replace_claims RPC guarded by optimistic version check, retried on
// contention. The merge engine itself never changes between backends.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AskResponse } from "./ask";
import type { ChecklistLeg } from "./checklist";
import { mergeClaims } from "./merge";
import { loadSeed, type StoreState } from "./seed";
import type { MergeRunResult, StoreBackend } from "./store-backend";
import { readSupabaseEnv, redactSecrets } from "./supabase-env";
import type {
  ExtractedClaim,
  Leg,
  MergeResult,
  OfficialRule,
  OperatorClaim,
} from "./types";

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}

function rpcFailure(op: string, err: unknown): Error {
  return new Error(`${op} failed: ${redactSecrets(errorText(err))}`);
}

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
  const { url, key } = readSupabaseEnv();
  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  async function loadVersioned(): Promise<VersionedState> {
    let data: unknown;
    try {
      const result = await client.rpc("get_corridor_state");
      if (result.error) throw rpcFailure("get_corridor_state", result.error);
      data = result.data;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("get_corridor_state failed:")) {
        throw err;
      }
      throw rpcFailure("get_corridor_state", err);
    }
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
    let error: { message: string } | null = null;
    try {
      const result = await client.rpc("replace_claims", {
        expected_version: expectedVersion,
        new_claims: claims,
      });
      error = result.error;
    } catch (err) {
      throw rpcFailure("replace_claims", err);
    }
    if (!error) return true;
    // The RPC raises a plain application error prefixed 'version_conflict' on
    // a stale version. (Deliberately NOT SQLSTATE 40001: PostgREST treats
    // serialization_failure as transient and retries it server-side forever —
    // the retry belongs in runMerge, not the transport.)
    if (error.message.includes("version_conflict")) {
      return false;
    }
    throw rpcFailure("replace_claims", error);
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
      if (error) throw rpcFailure("addClaim", error);
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
      if (error) throw rpcFailure("updateClaim", error);
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
      if (error) throw rpcFailure("reset_corridor", error);
    },

    // Cache reads/writes are best-effort by contract (store-backend.ts): a
    // failure degrades to a live generation, never a failed request.
    async getChecklistLeg(
      fingerprint: string,
      leg: Leg,
    ): Promise<ChecklistLeg | null> {
      try {
        const { data, error } = await client
          .from("checklist_cache")
          .select("section")
          .eq("store_fingerprint", fingerprint)
          .eq("leg", leg)
          .maybeSingle();
        if (error) {
          console.error("cache: getChecklistLeg failed:", redactSecrets(error.message));
          return null;
        }
        return data ? (data.section as ChecklistLeg) : null;
      } catch (err) {
        console.error("cache: getChecklistLeg failed:", redactSecrets(errorText(err)));
        return null;
      }
    },

    async putChecklistLeg(
      fingerprint: string,
      leg: Leg,
      section: ChecklistLeg,
    ): Promise<void> {
      try {
        const { error } = await client
          .from("checklist_cache")
          .upsert({ store_fingerprint: fingerprint, leg, section });
        if (error) {
          console.error("cache: putChecklistLeg failed:", redactSecrets(error.message));
          return;
        }
        // Any merge changed the fingerprint, so rows for other fingerprints
        // can never serve again — prune them to keep the table one store
        // state big.
        const { error: pruneError } = await client
          .from("checklist_cache")
          .delete()
          .neq("store_fingerprint", fingerprint);
        if (pruneError) {
          console.error("cache: prune failed:", redactSecrets(pruneError.message));
        }
      } catch (err) {
        console.error("cache: putChecklistLeg failed:", redactSecrets(errorText(err)));
      }
    },

    // Trail writes are best-effort by contract (store-backend.ts): a lost
    // trail row must never fail the user-facing request.
    async logDebrief(
      rawText: string,
      extracted: ExtractedClaim[],
    ): Promise<string | null> {
      try {
        const { data, error } = await client
          .from("debriefs")
          .insert({ raw_text: rawText, extracted })
          .select("id")
          .single();
        if (error) {
          console.error("trail: logDebrief failed:", redactSecrets(error.message));
          return null;
        }
        return data.id as string;
      } catch (err) {
        console.error("trail: logDebrief failed:", redactSecrets(errorText(err)));
        return null;
      }
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
      try {
        const { error } = await client.from("merge_events").insert(rows);
        if (error) {
          console.error(
            "trail: logMergeEvents failed:",
            redactSecrets(error.message),
          );
        }
      } catch (err) {
        console.error(
          "trail: logMergeEvents failed:",
          redactSecrets(errorText(err)),
        );
      }
    },

    async logAsk(question: string, response: AskResponse): Promise<void> {
      try {
        const { error } = await client.from("ask_logs").insert({
          question,
          answer: response.answer,
          gap: response.no_verified_intel,
          citations: response.cited_ids,
        });
        if (error) {
          console.error("trail: logAsk failed:", redactSecrets(error.message));
        }
      } catch (err) {
        console.error("trail: logAsk failed:", redactSecrets(errorText(err)));
      }
    },
  };
}
