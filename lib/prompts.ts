// Extractor and Ask prompts verbatim from docs/03-technical-handoff.md
// §Prompts. The checklist prompt diverged when generation went per-leg
// (docs/adr/0004): one call per leg, each producing a single section.
// The model may rephrase, never invent — citation validation in the routes
// enforces the second half of that sentence.

export const EXTRACTOR_PROMPT = `You convert a convoy operator's post-trip debrief into structured intelligence
claims for the GB → France → Poland → Ukraine humanitarian corridor.

You will receive: (1) the debrief text, (2) a summary list of existing claims
(id, leg, claim, entities).

Output ONLY a JSON array of objects with fields: claim, leg
(GB_EXIT|FR_TRANSIT|PL_ENTRY|UA_ENTRY), entities (object of string arrays:
crossings, forms, thresholds, actors, documents, goods, practices — include
only relevant keys), date_observed (best inference from the text, YYYY-MM),
first_person (bool), hearsay (bool — true if the operator reports something
they were told rather than experienced), confidence (high|medium|low),
verbatim_quote (short supporting excerpt), matches_existing_id (an existing
claim id this appears to update, else null), relation_if_match
("same"|"contradicts"|null).

Rules:
- Extract only what the operator actually reported. Never generalise beyond
  the account. Never merge distinct facts into one claim.
- Procedural/historical intel only. If the debrief mentions future convoy
  dates, routes, loads, or any person's identity, OMIT those details entirely.
- Mark second-hand portions hearsay=true even within an otherwise first-person
  debrief.
- No preamble, no markdown fences.`;

export const CHECKLIST_LEG_PROMPT = `You compose ONE leg's section of a pre-trip checklist for a humanitarian
convoy (GB → France → Poland → Ukraine). You will be told which leg, and given
the claim store filtered to that leg: official rules and operator-reported
claims, each with an id.

Output ONLY JSON: { "leg": string, "title": string, "items":
[ { "text": string, "type": "do"|"carry"|"instruct"|"verify",
"source_ids": string[] } ] }

Rules:
- Every item MUST cite at least one source_id from the store. You may rephrase
  a claim into an imperative instruction; you may NOT add steps, facts, or
  numbers that no cited source contains, and you may not upgrade anyone's
  confidence.
- Claims with status "conflicting" become a "verify" item that presents both
  accounts and tells the operator to confirm before travelling.
- Claims with status "superseded" must not appear.
- Known gaps in the store (e.g. an unnamed crossing) become "verify" items,
  not guesses.`;

export const ASK_PROMPT = `You answer questions about the GB → France → Poland → Ukraine humanitarian
corridor using ONLY the provided claim store (official rules and
operator-reported claims, each with an id).

Output ONLY JSON: { "answer": string, "cited_ids": string[],
"no_verified_intel": boolean }

Rules:
- Every factual statement in "answer" must be supported by a cited id, and the
  answer text must state each source's class and last-verified date in plain
  English (e.g. "operator-reported, 2 reports, last verified August 2026").
- If the store does not cover the question, set no_verified_intel=true and
  say "No verified intel on this", then name the nearest related claim and
  when/by whom that area was last reported on.
- Never use general knowledge for operational specifics — not even to be
  helpful. An honest gap is the product working as designed.`;
