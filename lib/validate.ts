// Hand-rolled guards for the LLM's extraction output (handoff §API routes:
// "validated (zod or hand-rolled guards)"). The model's JSON is untrusted
// input — anything malformed throws with a message the route turns into a 422.
import type { Confidence, ExtractedClaim, Leg } from "./types";

const LEGS: Leg[] = ["GB_EXIT", "FR_TRANSIT", "PL_ENTRY", "UA_ENTRY"];
const CONFIDENCE: Confidence[] = ["high", "medium", "low"];
const RELATIONS = ["same", "contradicts", null] as const;

function fail(index: number, message: string): never {
  throw new Error(`Extracted claim ${index}: ${message}`);
}

function normaliseEntities(
  index: number,
  value: unknown,
): Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(index, "entities must be an object");
  }
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      out[key] = [raw];
    } else if (
      Array.isArray(raw) &&
      raw.every((item) => typeof item === "string")
    ) {
      out[key] = raw;
    } else {
      fail(index, `entities.${key} must be a string or array of strings`);
    }
  }
  return out;
}

export function validateExtractedClaims(value: unknown): ExtractedClaim[] {
  if (!Array.isArray(value)) {
    throw new Error("Extraction output must be a JSON array");
  }
  return value.map((item, i) => {
    if (typeof item !== "object" || item === null) fail(i, "must be an object");
    const record = item as Record<string, unknown>;

    const claim = record.claim;
    if (typeof claim !== "string" || !claim.trim()) {
      fail(i, "claim must be a non-empty string");
    }
    const leg = record.leg;
    if (typeof leg !== "string" || !LEGS.includes(leg as Leg)) {
      fail(i, `leg must be one of ${LEGS.join(", ")}`);
    }
    const confidence = record.confidence;
    if (
      typeof confidence !== "string" ||
      !CONFIDENCE.includes(confidence as Confidence)
    ) {
      fail(i, "confidence must be high, medium or low");
    }
    const dateObserved = record.date_observed;
    if (typeof dateObserved !== "string" || !/^\d{4}-\d{2}(-\d{2})?$/.test(dateObserved)) {
      fail(i, "date_observed must be YYYY-MM or YYYY-MM-DD");
    }
    const matchId = record.matches_existing_id ?? null;
    if (matchId !== null && typeof matchId !== "string") {
      fail(i, "matches_existing_id must be a string or null");
    }
    const relation = record.relation_if_match ?? null;
    if (!RELATIONS.includes(relation as (typeof RELATIONS)[number])) {
      fail(i, "relation_if_match must be same, contradicts or null");
    }

    return {
      claim: claim.trim(),
      leg: leg as Leg,
      entities: normaliseEntities(i, record.entities ?? {}),
      date_observed: dateObserved,
      first_person: Boolean(record.first_person),
      hearsay: Boolean(record.hearsay),
      confidence: confidence as Confidence,
      verbatim_quote:
        typeof record.verbatim_quote === "string" ? record.verbatim_quote : "",
      matches_existing_id: matchId,
      relation_if_match: relation as ExtractedClaim["relation_if_match"],
    };
  });
}
