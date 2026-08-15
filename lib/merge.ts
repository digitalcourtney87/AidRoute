// THE deterministic merge engine — pure functions, no LLM, no store access.
// The model proposes; this module decides. Rules per docs/03-technical-handoff.md
// §Merge engine, applied in order per extracted claim.
import { parseStoreDate } from "./freshness";
import type {
  ExtractedClaim,
  Leg,
  MergeLogEntry,
  MergeResult,
  OperatorClaim,
} from "./types";

export interface MergeOutcome {
  log: MergeResult;
  claims: OperatorClaim[];
}

const MS_PER_DAY = 86_400_000;
const SUPERSEDE_WINDOW_DAYS = 60;

const LEG_PREFIX: Record<Leg, string> = {
  GB_EXIT: "GB",
  FR_TRANSIT: "FR",
  PL_ENTRY: "PL",
  UA_ENTRY: "UA",
};

// Plain substring matching misses the seed's threshold phrasing ("3.5t → 7t
// vehicle limit" vs "5t vehicle limit"), so overlap also accepts a shared
// non-stopword token. Deterministic, and strictly widens the handoff's
// "substring is fine" minimum.
const STOPWORDS = new Set([
  "the", "a", "an", "of", "at", "to", "and", "for", "was", "is", "in", "on",
  "with", "per", "not", "now", "or", "by",
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .map((t) => t.replace(/^\.+|\.+$/g, ""))
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

function valuesOverlap(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la.includes(lb) || lb.includes(la)) return true;
  const tb = tokens(b);
  for (const t of tokens(a)) if (tb.has(t)) return true;
  return false;
}

function allValues(entities: Record<string, string[]>): string[] {
  return Object.values(entities).flat();
}

function overlapCount(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): number {
  let count = 0;
  for (const va of allValues(a)) {
    for (const vb of allValues(b)) {
      if (valuesOverlap(va, vb)) count += 1;
    }
  }
  return count;
}

// Units are normalised so "5 tonnes" and "5t" compare, while "5 hours" and
// "7t" never do — incommensurable quantities are not contradictions.
const UNIT_ALIASES: Record<string, string> = {
  t: "t", tonne: "t", tonnes: "t", ton: "t", tons: "t",
  h: "h", hr: "h", hrs: "h", hour: "h", hours: "h",
  min: "min", mins: "min", minute: "min", minutes: "min",
  d: "d", day: "d", days: "d",
  kg: "kg", kgs: "kg",
};

function numbersByUnit(values: string[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const value of values) {
    for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/g)) {
      const raw = (match[2] ?? "").toLowerCase();
      const unit = UNIT_ALIASES[raw] ?? raw;
      if (!out.has(unit)) out.set(unit, new Set());
      out.get(unit)!.add(Number(match[1]));
    }
  }
  return out;
}

function isSubset(a: Set<number>, b: Set<number>): boolean {
  for (const n of a) if (!b.has(n)) return false;
  return true;
}

// A "same" verdict from the model is overridden by code when both sides carry
// threshold numbers in the SAME unit and neither side's numbers are contained
// in the other's. Subset means agreement or refinement ("7t" corroborates
// "3.5t → 7t"); a novel same-unit number on either side ("5t" against
// "3.5t → 7t") blocks the silent merge — transition phrasings carry old and
// new values, so a bare intersection check would miss real contradictions.
// Numbers in units the other side doesn't mention are ignored entirely.
function thresholdsContradict(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const na = numbersByUnit(a.thresholds ?? []);
  const nb = numbersByUnit(b.thresholds ?? []);
  for (const [unit, setA] of na) {
    const setB = nb.get(unit);
    if (!setB) continue;
    if (!isSubset(setA, setB) && !isSubset(setB, setA)) return true;
  }
  return false;
}

function daysBetween(earlier: string, later: string): number {
  return Math.floor(
    (parseStoreDate(later).getTime() - parseStoreDate(earlier).getTime()) /
      MS_PER_DAY,
  );
}

function laterDate(a: string, b: string): string {
  return parseStoreDate(b).getTime() > parseStoreDate(a).getTime() ? b : a;
}

function nextId(leg: Leg, claims: OperatorClaim[]): string {
  const prefix = LEG_PREFIX[leg];
  let max = 0;
  for (const claim of claims) {
    const match = claim.id.match(/^([A-Z]+)-(\d+)$/);
    if (match && match[1] === prefix) max = Math.max(max, Number(match[2]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function toOperatorClaim(
  extracted: ExtractedClaim,
  id: string,
  status: OperatorClaim["status"],
): OperatorClaim {
  return {
    id,
    leg: extracted.leg,
    source_class: "operator_reported",
    claim: extracted.claim,
    entities: structuredClone(extracted.entities),
    date_observed: extracted.date_observed,
    last_verified: extracted.date_observed,
    first_person: extracted.first_person,
    hearsay: extracted.hearsay,
    confidence: extracted.confidence,
    status,
    n_reports: 1,
    verbatim_quote: extracted.verbatim_quote,
  };
}

interface Candidate {
  target: OperatorClaim;
  relation: "same" | "contradicts" | null;
}

// Rule 1 + rule 5. The model's matches_existing_id is a hint: use it (with
// its relation) only when entity overlap verifies in code. Otherwise scan
// same-leg claims for the best overlap — but with no model relation to lean
// on, only a detectable numeric contradiction may trigger rule 4; anything
// vaguer becomes a new claim rather than a guessed merge.
function findCandidate(
  extracted: ExtractedClaim,
  claims: OperatorClaim[],
): Candidate | null {
  const matchable = claims.filter(
    (c) => c.leg === extracted.leg && c.status !== "superseded",
  );

  if (extracted.matches_existing_id) {
    const hinted = matchable.find((c) => c.id === extracted.matches_existing_id);
    if (hinted && overlapCount(extracted.entities, hinted.entities) > 0) {
      return { target: hinted, relation: extracted.relation_if_match };
    }
  }

  let best: OperatorClaim | null = null;
  let bestCount = 0;
  for (const claim of matchable) {
    const count = overlapCount(extracted.entities, claim.entities);
    if (count > bestCount || (count === bestCount && count > 0 && best && claim.id < best.id)) {
      best = claim;
      bestCount = count;
    }
  }
  return best ? { target: best, relation: null } : null;
}

export function mergeClaims(
  extracted: ExtractedClaim[],
  existingClaims: OperatorClaim[],
): MergeOutcome {
  const claims = structuredClone(existingClaims);
  const log: MergeLogEntry[] = [];

  for (const ex of extracted) {
    const candidate = findCandidate(ex, claims);

    // Rule 2: no candidate → new single_report claim.
    if (!candidate) {
      claims.push(toOperatorClaim(ex, nextId(ex.leg, claims), "single_report"));
      log.push({ extracted: ex, action: "created" });
      continue;
    }

    const { target } = candidate;
    const contradicts =
      candidate.relation === "contradicts" ||
      thresholdsContradict(ex.entities, target.entities);

    // Rule 3: corroborate — but conflicts are only ever resolved manually.
    if (candidate.relation === "same" && !contradicts) {
      target.n_reports += 1;
      target.last_verified = laterDate(target.last_verified, ex.date_observed);
      if (target.status !== "conflicting") target.status = "corroborated";
      log.push({ extracted: ex, action: "corroborated", targetId: target.id });
      continue;
    }

    // Rule 4: contradiction — supersede if clearly newer, else conflict.
    if (contradicts) {
      if (daysBetween(target.last_verified, ex.date_observed) > SUPERSEDE_WINDOW_DAYS) {
        const incoming = toOperatorClaim(ex, nextId(ex.leg, claims), "single_report");
        target.status = "superseded";
        target.superseded_by = incoming.id;
        claims.push(incoming);
        log.push({ extracted: ex, action: "superseded", targetId: target.id });
      } else {
        const incoming = toOperatorClaim(ex, nextId(ex.leg, claims), "conflicting");
        incoming.conflicts_with = [target.id];
        target.status = "conflicting";
        target.conflicts_with = [...(target.conflicts_with ?? []), incoming.id];
        claims.push(incoming);
        log.push({ extracted: ex, action: "conflict", targetId: target.id });
      }
      continue;
    }

    // Overlapping candidate but no asserted relation and no detectable
    // contradiction: record as its own claim rather than guess a merge.
    claims.push(toOperatorClaim(ex, nextId(ex.leg, claims), "single_report"));
    log.push({ extracted: ex, action: "created" });
  }

  return { log, claims };
}
