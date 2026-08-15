# AidRoute Debrief — technical handoff for Claude Code

You are building a one-day hackathon demo. Optimise for a rehearsed, reliable demo path over completeness. Anything not on the demo path is out of scope unless explicitly marked STRETCH.

## Product in one paragraph

Convoy operators moving humanitarian aid (GB → France → Poland → Ukraine) rely on unpublished, word-of-mouth border knowledge. AidRoute Debrief ingests a post-trip debrief (pasted text), extracts structured "intelligence claims" via the Claude API, merges them **deterministically in code** against an existing claim store (corroborate / supersede / conflict), and renders (1) a living corridor brief and (2) a generated pre-trip checklist. Every rendered statement carries a source class (official vs operator-reported), an n-reports count, and a last-verified date with freshness decay. The model never decides what is true; code does.

## Stack & constraints

- Next.js 14+ (App Router), TypeScript strict, Tailwind. No component library.
- No database, no auth. Claim store = in-memory module state seeded from `data/seed-data.json` (file provided — do not modify its content, only consume it). Persist mutations for the session only; a "Reset demo" button restores the seed.
- Claude API via `ANTHROPIC_API_KEY` env var, model `claude-sonnet-4-6`, `temperature: 0`, called **only from server routes**, never the client.
- Every LLM call: `try/catch`, 30s timeout, and a canned fallback response for the demo inputs (see Demo reliability).

## Design language

GOV.UK-inspired, not GOV.UK-branded (do not use the crown or GDS Transport font): white background, near-black text (#0b0c0c), primary action blue #1d70b8, Inter via next/font, generous whitespace, semantic HTML, visible focus states, WCAG AA contrast. Status tags as GDS-style rectangular tags:
- CORROBORATED → green tint
- SINGLE REPORT → blue tint
- CONFLICTING → red tint
- SUPERSEDED → grey, struck-through summary, collapsed by default
- Freshness: last_verified ≤30 days = green dot; 31–90 = amber dot + "treat as unconfirmed"; >90 = red dot + "stale".
- Source class rendered on every line: `Official — HMRC, checked 14 Aug 2026` or `Operator-reported — 2 reports, last verified Aug 2026`.

## Data model (mirror seed-data.json exactly)

```typescript
type Leg = "GB_EXIT" | "FR_TRANSIT" | "PL_ENTRY" | "UA_ENTRY";
type Confidence = "high" | "medium" | "low";
type Status = "corroborated" | "single_report" | "conflicting" | "superseded";

interface OperatorClaim {
  id: string;
  leg: Leg;
  source_class: "operator_reported";
  claim: string;
  entities: Record<string, string[]>;
  date_observed: string;        // YYYY-MM or YYYY-MM-DD
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

interface OfficialRule {
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
```

Extraction output type (from the LLM, before merging):

```typescript
interface ExtractedClaim {
  claim: string;
  leg: Leg;
  entities: Record<string, string[]>;
  date_observed: string;
  first_person: boolean;
  hearsay: boolean;
  confidence: Confidence;
  verbatim_quote: string;
  matches_existing_id: string | null;   // model's suggestion only — code re-verifies
  relation_if_match: "same" | "contradicts" | null;
}
```

## Architecture & file plan

```
app/
  page.tsx                    // Screen 1: Debrief a trip
  brief/page.tsx              // Screen 2: Corridor brief
  checklist/page.tsx          // Screen 3: Pre-trip checklist
  ask/page.tsx                // STRETCH Screen 4: Ask the corridor
  api/extract/route.ts        // POST debrief text → ExtractedClaim[]
  api/merge/route.ts          // POST ExtractedClaim[] → MergeResult (deterministic)
  api/checklist/route.ts      // POST → checklist JSON (LLM, constrained)
  api/ask/route.ts            // STRETCH: POST question → grounded answer
lib/
  store.ts                    // seed load, in-memory state, reset()
  merge.ts                    // THE deterministic merge engine — pure functions, no LLM
  freshness.ts                // decay calculation
  anthropic.ts                // single fetch wrapper: timeout, temp 0, error fallback
  prompts.ts                  // all prompts as exported consts
data/seed-data.json
```

## Merge engine (lib/merge.ts) — the heart of the build

Pure, unit-testable functions. Rules, applied in order per extracted claim:

1. **Entity match:** candidate existing claims = same `leg` AND ≥1 overlapping entity value (case-insensitive substring match is fine for the demo).
2. **No candidate →** create new claim: `status: single_report`, `n_reports: 1`.
3. **Candidate + `relation_if_match === "same"` (and text doesn't contradict on any numeric/threshold entity) →** CORROBORATE: `n_reports += 1`, `last_verified = max(dates)`, `status = corroborated` (unless currently `conflicting` — conflicts are only resolved manually).
4. **Candidate + contradiction:**
   - new `date_observed` > existing `last_verified` by **more than 60 days** → SUPERSEDE: existing `status = superseded`, `superseded_by = new.id`; new claim enters as `single_report`.
   - within 60 days of each other → CONFLICT: both claims `status = conflicting`, cross-referenced; UI must show both. Never auto-resolve.
5. Model's `matches_existing_id` is a hint only: verify entity overlap in code before using it; ignore it if overlap fails.
6. Return a `MergeResult` log: `[{extracted, action: "created"|"corroborated"|"superseded"|"conflict", targetId?}]` — Screen 1 renders this as the post-submit summary.

Write 5–6 unit tests against the fictional `demo_debrief_2` in the seed file: its `expected_merge_outcomes` array is the test oracle (corroborate FR-001; conflict on PL-004's threshold; new claim created).

## API routes

**POST /api/extract** — body `{ text: string }`. Calls Claude with EXTRACTOR_PROMPT + the current claim store's `{id, leg, claim, entities}` summaries (so the model can propose `matches_existing_id`). Response must be parsed with a JSON-fence stripper and validated (zod or hand-rolled guards). On any failure: if `text` matches a known demo input (hash or startsWith check), return the pre-canned extraction from `data/canned/`; otherwise return 422 with a friendly message.

**POST /api/merge** — body `{ extracted: ExtractedClaim[] }`. No LLM. Applies merge engine to the store, returns `MergeResult` + updated store snapshot.

**POST /api/checklist** — body `{ legs?: Leg[] }`. Sends active (non-superseded) claims + official rules to Claude with CHECKLIST_PROMPT. Validate that every checklist line's `source_ids` exist in the store; drop any line that cites nothing (log it) — this enforces "the model may rephrase, never invent".

**STRETCH POST /api/ask** — body `{ question: string }`. ASK_PROMPT + full active store as context. Response schema `{ answer: string, cited_ids: string[], no_verified_intel: boolean }`. Same citation validation: any sentence without a resolvable citation is replaced by the no-intel fallback.

## Prompts (lib/prompts.ts)

**EXTRACTOR_PROMPT**
```
You convert a convoy operator's post-trip debrief into structured intelligence
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
- No preamble, no markdown fences.
```

**CHECKLIST_PROMPT**
```
You compose a pre-trip checklist for a humanitarian convoy (GB → France →
Poland → Ukraine) from the provided claim store. The store contains official
rules and operator-reported claims, each with an id.

Output ONLY JSON: { "legs": [ { "leg": string, "title": string, "items":
[ { "text": string, "type": "do"|"carry"|"instruct"|"verify",
"source_ids": string[] } ] } ] }

Rules:
- Every item MUST cite at least one source_id from the store. You may rephrase
  a claim into an imperative instruction; you may NOT add steps, facts, or
  numbers that no cited source contains, and you may not upgrade anyone's
  confidence.
- Claims with status "conflicting" become a "verify" item that presents both
  accounts and tells the operator to confirm before travelling.
- Claims with status "superseded" must not appear.
- Known gaps in the store (e.g. an unnamed crossing) become "verify" items,
  not guesses.
```

**ASK_PROMPT (stretch)**
```
You answer questions about the GB → France → Poland → Ukraine humanitarian
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
  helpful. An honest gap is the product working as designed.
```

## Screens

**Screen 1 — Debrief a trip (`/`)**
Heading, one textarea (12 rows, placeholder: "Tell us about the trip — which crossing, what they asked for, what surprised you…"), primary button "Extract intel". On response: render the MergeResult as cards — "New claim created", "Corroborates FR-001 (now 2 reports)", "CONFLICT with PL-004 — both shown in the brief". Buttons: "View corridor brief →", "Reset demo" (top-right, subtle).

**Screen 2 — Corridor brief (`/brief`)**
Four leg sections in journey order. Claim cards: claim text, status tag, freshness dot + last-verified date, source-class line, expandable detail (entities, verbatim quote, notes, supersession history). Conflicting pairs render side-by-side in a red-bordered container titled "Conflicting reports — verify before travel". A "Known gaps" callout lists claims whose entities include "VERIFY".

**Screen 3 — Pre-trip checklist (`/checklist`)**
"Generate checklist" button → renders legs as checklists, each item with its type badge and citation chips (click → jumps to that claim on /brief). Print stylesheet (`@media print`: hide nav/buttons). Footer disclaimer: "Navigation aid, not legal advice. Verify conflicting and stale items before travel."

**STRETCH Screen 4 — Ask the corridor (`/ask`)**
Single input + three suggested-question chips (hardcoded): "Which Polish crossing should we use?", "Does the T1 need every item listed?", "Can we take donated medicines?". Render answer with citation chips; `no_verified_intel` answers styled distinctly (amber panel) — this is a feature, style it proudly, not as an error state.

## Demo reliability (do not skip)

- `data/canned/` holds pre-computed JSON responses for: extraction of `demo_debrief_2.raw_text`, the default checklist, and the three /ask questions. Routes check input against known demo inputs first and serve canned responses instantly — the live LLM path is for unrehearsed inputs only.
- "Reset demo" restores seed state so the merge demo can be run repeatedly.
- `npm run demo-check` script: hits all routes with demo inputs, asserts non-error + schema-valid responses. Run before every rehearsal.

## Build order (stop at each checkpoint if behind)

1. Scaffold + types + store + seed rendering on /brief (static). ← *worst case, this alone demos the data model*
2. Merge engine + unit tests against `expected_merge_outcomes`.
3. /api/extract with canned fallback + Screen 1 end-to-end with `demo_debrief_2`.
4. Checklist route + Screen 3 with citation validation.
5. Polish: freshness dots, conflict styling, print CSS, Reset.
6. STRETCH: /ask.

## Out of scope — do not build even if asked by a teammate

Auth, accounts, Supabase/any DB, voice recording/transcription, OCR, multi-corridor support, editing claims by hand in the UI, any feature that stores future convoy movements, emailing, PDF generation (print CSS suffices).
