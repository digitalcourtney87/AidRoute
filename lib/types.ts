// Data model — mirrors docs/03-technical-handoff.md §Data model and data/seed-data.json.

export type Leg = "GB_EXIT" | "FR_TRANSIT" | "PL_ENTRY" | "UA_ENTRY";
export type Confidence = "high" | "medium" | "low";
export type Status = "corroborated" | "single_report" | "conflicting" | "superseded";

export const LEGS_IN_JOURNEY_ORDER: Leg[] = [
  "GB_EXIT",
  "FR_TRANSIT",
  "PL_ENTRY",
  "UA_ENTRY",
];

export interface OperatorClaim {
  id: string;
  leg: Leg;
  source_class: "operator_reported";
  claim: string;
  entities: Record<string, string[]>;
  date_observed: string; // YYYY-MM or YYYY-MM-DD
  last_verified: string;
  first_person: boolean;
  hearsay: boolean;
  confidence: Confidence;
  status: Status;
  superseded_by?: string;
  n_reports: number;
  verbatim_quote?: string;
  notes?: string;
}

export interface OfficialRule {
  id: string;
  leg: Leg;
  source_class: "official";
  claim: string;
  authority: string;
  published: string;
  last_verified: string;
  confidence: Confidence;
  notes?: string;
}

// Extraction output from the LLM, before merging. The model's match fields are
// suggestions only — the merge engine re-verifies entity overlap in code.
export interface ExtractedClaim {
  claim: string;
  leg: Leg;
  entities: Record<string, string[]>;
  date_observed: string;
  first_person: boolean;
  hearsay: boolean;
  confidence: Confidence;
  verbatim_quote: string;
  matches_existing_id: string | null;
  relation_if_match: "same" | "contradicts" | null;
}

export type MergeAction = "created" | "corroborated" | "superseded" | "conflict";

export interface MergeLogEntry {
  extracted: ExtractedClaim;
  action: MergeAction;
  targetId?: string;
}

export type MergeResult = MergeLogEntry[];
