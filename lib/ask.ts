// Ask-the-corridor grounding enforcement: the model answers ONLY from the
// claim store, and code verifies it. An answer whose citations all fail
// validation is withheld and replaced with the honest no-intel fallback —
// the product's signature move, not an error state.

export const NO_INTEL_FALLBACK = "No verified intel on this.";

// Single source of truth for the three rehearsed chips — the page, the
// freeze script, and demo-check all import from here.
export const SUGGESTED_QUESTIONS = [
  "Which Polish crossing should we use?",
  "Does the T1 need every item listed?",
  "Can we take donated medicines?",
] as const;

export interface AskResponse {
  answer: string;
  cited_ids: string[];
  no_verified_intel: boolean;
}

export function validateAsk(
  value: unknown,
  validIds: Set<string>,
): AskResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("Ask output must be an object with an answer");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.answer !== "string" || !record.answer.trim()) {
    throw new Error("Ask output must include a non-empty answer string");
  }

  const cited = Array.isArray(record.cited_ids)
    ? record.cited_ids.filter(
        (id): id is string => typeof id === "string" && validIds.has(id),
      )
    : [];
  const noIntel = Boolean(record.no_verified_intel);

  // A factual answer must stand on at least one real citation; otherwise the
  // grounded thing to say is that we don't know.
  if (!noIntel && cited.length === 0) {
    return {
      answer: `${NO_INTEL_FALLBACK} The model's answer cited no source that exists in the store, so it was withheld.`,
      cited_ids: [],
      no_verified_intel: true,
    };
  }

  return { answer: record.answer.trim(), cited_ids: cited, no_verified_intel: noIntel };
}
