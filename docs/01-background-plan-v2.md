# AidRoute — Build Plan v2 (post-adversarial review)

**Concept:** "Know before you load." An eligibility-and-routing decision layer for UK humanitarian aid movements (GB → Poland → Ukraine corridor).
**Pivot option:** Crisis Comms in Plain English (unchanged from v1, Section 6 of v1 plan).
**Stack:** Next.js 14 · TypeScript · Tailwind · Claude API · deterministic rules engine in code. No Supabase, no auth, no OCR unless everything else works.

## Change log vs v1

| # | Change | Why |
|---|--------|-----|
| 1 | Product reframed: eligibility & journey plan first; commodity codes demoted to background, invoked only when actually required | GB export side is now simplified (oral/by-conduct declarations for qualifying goods in small vehicles); classifying sleeping bags automates bureaucracy that no longer exists |
| 2 | Architecture: 4 LLM agents → LLM extraction + **deterministic rules engine** + LLM ambiguity resolver + plan generator | Compliance decisions made by code from cited rules, not by model inference; fewer failure points, lower latency, stronger technical story |
| 3 | Killer demo = the refusal moment (medicines) | HMRC guidance requires excluded goods (e.g. non-OTC medicines, dual-use, controlled goods) to be removed before travelling — a real rule, demonstrated as trustworthy agent behaviour |
| 4 | Pitch opener changed; Dover story demoted to context | Cannot prove the counterfactual; incident predates the easement |
| 5 | HMRC line removed from pitch | Avoids implying institutional endorsement or use of privileged position; use "public-sector product management" framing |
| 6 | Falsification gates added; validation scoped to what is achievable in ~1 week alongside a day job | v1 assumed the product deserved to exist |
| 7 | Provenance made the technical differentiator: every answer shows rule, authority, date, passage, conclusion | "A trustworthy decision layer between messy logistics and fragmented official rules" |

**Retained from v1 (still correct):** hour-by-hour discipline, scope-lock ceremony, rehearsed demo path with fixed input, backup recording, GDS-style UI direction, corridor-pack framing, team recruitment pitch.

**Open verification items (check before repeating in the pitch):**
- Whether the GB easement's sunset clause was formally removed in 2023 (agent's claim; plausible — guidance is live and still framed "temporary" — but confirm on legislation.gov.uk)
- Current operational status and process of Ukraine's State System for Humanitarian Aid
- EU-side import relief mechanics for Poland specifically (registration of the recipient organisation with competent authorities — likely where real residual pain lives)
- Any statistics (EU Civil Protection Mechanism tonnage, convoy counts) — do not use figures in the pitch that you have not personally traced to a primary source

---

## 1. Architecture v2

```
[Manifest + journey context form]
        │
        ▼
  LLM: Extraction & normalisation
  ("box of pills" → category: medicine, ambiguous: true)
        │
        ▼
  CODE: Deterministic rules engine
  (rule packs per jurisdiction, each rule = {id, authority,
   source_url, published, last_checked, passage, logic})
        │
        ├── clear items ──────────────────────┐
        ▼                                     │
  LLM: Ambiguity resolver                     │
  (asks the user targeted questions;          │
   answers re-enter the rules engine)         │
        ▼                                     ▼
  LLM: Action-plan generator ◄────────────────┘
  (journey plan by leg + document list + contacts,
   every line citing rule IDs — never inventing rules)
```

**The division of labour, stated plainly for judges:** Claude interprets messy human input and drafts human-readable output. The rules engine — plain TypeScript over versioned rule packs — makes every compliance determination. The model never decides what the law says.

### Rule pack schema

```typescript
interface Rule {
  id: string;                  // "UK-EASEMENT-001"
  jurisdiction: "GB" | "EU_PL" | "UA";
  authority: string;           // "HMRC"
  source_url: string;
  published: string;           // ISO date
  last_checked: string;        // ISO date — shown in UI
  passage: string;             // quoted/paraphrased relevant text
  applies_when: RuleCondition; // machine-evaluable predicate
  outcome: "CLEAR" | "EXCLUDED" | "ACTION_REQUIRED" | "DOCUMENT_REQUIRED" | "CHECK_REQUIRED";
  action?: string;             // concrete next step
  contact?: string;            // who to ask
}
```

Seed packs (pre-day task): GB simplified-process eligibility + exclusions (controlled goods, non-OTC medicines, dual-use, excise, military, sanctions-related); EU/Poland entry basics; Ukraine humanitarian declaration basics. Where a leg's rules are uncertain, the honest outcome is `CHECK_REQUIRED` with the right authority named — that is a feature.

---

## 2. The three screens

**Screen 1 — "What are you taking?"**
Paste manifest. Select: route (London → Ukraine), vehicle (van ≤3.5t), sender type (registered charity), purpose (humanitarian donation). One button: "Check my journey". Footer: "Guidance navigator, not legal advice. Sources cited on every answer."

**Screen 2 — "3 things need your attention"**
Summary card: `20 goods checked · 17 clear · 2 need information · 1 cannot travel under the simplified process`. Items grouped by status with GDS-style tags. Inline clarification interaction for ambiguous items (the medicines moment). Each determination expandable: rule → authority → date last checked → passage → conclusion.

**Screen 3 — "Your journey plan"**
Checklist by leg (Before leaving GB / Entering the EU / Entering Ukraine), each line cited. Documents to carry. Contacts (ESS helpline etc.). "Download journey pack" (printable HTML — keep the v1 document generator, simplified).

---

## 3. Revised prompt pack

### Prompt 1 — Extraction & normalisation

```
You are the intake interpreter for AidRoute, a humanitarian aid journey checker.
You DO NOT make compliance decisions. You convert messy human input into
structured data for a rules engine.

Input: a raw manifest (free text, informal, possibly multilingual) plus journey
context (route, vehicle, sender, purpose).

Output ONLY valid JSON:
{
  "line_items": [{
    "raw_text": string,
    "description_normalised": string,
    "quantity": number | null,
    "category": "clothing" | "bedding" | "hygiene" | "food" | "medical_device"
              | "medicine" | "power_equipment" | "battery" | "comms_equipment"
              | "protective_equipment" | "vehicle_parts" | "other",
    "attributes": { "battery_powered": boolean | null,
                    "otc_medicine": boolean | null,
                    "contains_fuel": boolean | null },
    "ambiguous": boolean,
    "clarification_question": string | null
  }]
}

Rules:
- Flag ANY possible medicine, comms equipment, protective equipment, or
  battery-containing item as its true category even if described casually
  ("box of pills" → medicine, ambiguous=true).
- When unsure between a benign and a regulated category, choose the regulated
  one and set ambiguous=true with a specific question.
- Never drop or merge items. Never speculate about legality.
```

### Prompt 2 — Ambiguity resolver

```
You are the clarification assistant for AidRoute. The rules engine has marked
items as needing more information before a determination can be made.

For each item you receive: the item, why it is ambiguous, and which rule
conditions are unresolved (e.g. "medicine: is it available over the counter?
does the sender hold a licence to distribute?").

Produce ONE user-facing question per item: specific, plain English, answerable
by a volunteer without expert knowledge. Where helpful, offer options.

Output ONLY valid JSON:
{ "clarifications": [{ "item": string, "question": string,
                       "answer_options": string[] | null,
                       "resolves_rule_conditions": string[] }] }

Never explain the law yourself; your questions gather facts, the rules engine
applies rules.
```

### Prompt 3 — Action-plan generator

```
You are the journey-plan writer for AidRoute. You receive the rules engine's
determinations: per-item outcomes with rule IDs, plus consignment-level
requirements per leg (GB exit / EU entry / Ukraine entry).

Write the journey plan in GDS plain English:
- Group by leg. Checklist form. Short sentences, active voice.
- EVERY line must carry the rule IDs it derives from as [RULE-ID] markers
  (the UI turns these into expandable citations).
- If any item's outcome is EXCLUDED, the plan MUST open with a prominent
  "Your consignment is not ready to leave" section listing what to resolve
  or remove. Never soften this.
- For CHECK_REQUIRED outcomes, name the specific authority and contact route.
- You may rephrase; you may not add, remove, or reinterpret any determination.

Output ONLY valid JSON:
{ "ready_to_leave": boolean,
  "blockers": [{ "item": string, "action": string, "rule_ids": string[] }],
  "legs": [{ "name": string,
             "steps": [{ "text": string, "rule_ids": string[],
                         "type": "do" | "carry" | "contact" }] }],
  "documents": [string], "contacts": [{ "who": string, "for": string,
  "details": string }] }
```

### Prompt 4 — UI scaffold (Lovable / Bolt.new)

As v1 Prompt E, with these changes: rename to AidRoute; Screen 1 adds the journey-context selectors; Screen 2 becomes the attention-first summary with inline clarification and expandable citations (rule name, authority, published date, "last checked" date, passage); Screen 3 is the journey plan by leg with a "not ready to leave" blocking state. Remove Supabase; hold state client-side; stub `POST /api/check` and `POST /api/plan` with mock JSON.

---

## 4. Pre-day validation (scoped to reality)

The adversarial review's full programme (8–12 interviews + 5-org manifest test + 5-person challenge) is a multi-week research project. Achievable version alongside a day job:

| Priority | Activity | Target | Time |
|----------|----------|--------|------|
| P0 | Outreach to convoy organisers (Mighty Convoy, British-Ukrainian Aid, Ukrainian community orgs, convoy Facebook groups) using the specific "tell me about your last shipment" script | 2–3 conversations, 1 anonymised manifest | 3–4 hrs spread over the week |
| P0 | Build the GB rule pack from the live GOV.UK humanitarian aid guidance; date-stamp every rule | Complete GB pack | 2 hrs |
| P1 | Mini customs challenge: give 3 people (friends/colleagues, or teammates on the hackathon morning) the fictional consignment + 20 min + Google; record time, sites visited, divergent answers, unresolved questions | Comparison metrics for the demo | 1.5 hrs |
| P1 | EU/Poland + Ukraine rule packs (accept more CHECK_REQUIRED outcomes here) | Two thin packs | 2 hrs |
| P2 | ESS mystery shop | One evidence slide | 30 min |

**Interview discipline:** ask about the last shipment, not about problems in the abstract. "What happened between deciding what to send and the van leaving?" "What did you discover too late?" "Show me the documents you used." Study artefacts, not opinions.

### Falsification gates (decide the evening before)

- **GO:** ≥3 recent-organiser conversations, ≥2 reporting significant uncertainty, duplicated work, or late-discovered problems.
- **STRONG GO:** one real manifest plus words to the effect of "I'd have used this before our last trip."
- **PIVOT to Crisis Comms:** experienced organisers consistently say "we reuse the same process every time; customs isn't a meaningful problem now." Record this as research — it is a finding, not a failure.
- **Watch-item:** if pain has migrated to the EU-entry leg (recipient-organisation registration, per-country relief processes), narrow the product to that leg rather than abandoning it — but be honest that this is the hardest leg to build rules for in a day.

---

## 5. Revised demo script (3 minutes)

1. **Opener (30s):** "Imagine you're driving humanitarian aid from London to Ukraine tomorrow. Your van holds blankets, generators, power banks, first-aid kits and two boxes of donated medicines. Which goods can use the simplified customs process? Which need declarations? Which shouldn't be in the van at all? The answers exist — spread across three jurisdictions' guidance."
2. **Demo (100s):** Paste the messy manifest → summary: "17 clear, 2 need information, 1 cannot travel" → the medicines moment: system refuses to proceed, asks "What medicines are you carrying?" → user answers → "These cannot use the simplified process — remove them or resolve X" with the cited HMRC rule and its last-checked date → journey plan by leg → download pack.
3. **Technical story (25s):** "Claude interprets the messy input. A deterministic rules engine makes every compliance decision from cited, dated official rules. The AI knows when not to answer."
4. **Context & credibility (20s):** "In 2022, charity vans sat at Dover for days; government simplified the front door in response. The rest of the journey is still fragmented across authorities. We tested this against [N] real shipments / with organisers we spoke to this week." (Only claims you can stand behind.)
5. **Close (15s):** "Rules plus situation in, personalised action plan plus evidence out. This corridor is the first pack; any crisis corridor can be the next."

**Founder framing (if asked):** "I work in public-sector product management — I'm interested in how rules can be technically available yet practically un-navigable." Do not name your employer in the pitch; do not imply endorsement.

---

## 6. Revised risks

| Risk | Mitigation |
|------|------------|
| Judge who knows the easement asks "why does this exist when export is already simplified?" | That IS the product: the tool's first answer for eligible goods is "you qualify for the simplified process — here's what to carry"; value concentrates on exclusions, ambiguity, and the EU/Ukraine legs |
| Validation contradicts the premise mid-week | Pivot gate is pre-committed; Crisis Comms plan remains fully specified in v1 |
| Rule packs wrong or stale | Every rule carries published + last-checked dates surfaced in UI; unknown = CHECK_REQUIRED, never a guess |
| Unverified statistics creep into the pitch | Pitch review pass the night before: delete any figure without a personally-verified primary source |
| Over-refusal makes the demo feel obstructive | Demo manifest engineered so most items are CLEAR; refusal is one memorable moment, not the whole experience |
| Civil service perception risk | No employer naming, no institutional framing, no non-public information; everything grounded in published guidance |
