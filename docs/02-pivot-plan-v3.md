# AidRoute v3 — Pivot plan (post-interview, night before the hackathon)

**New concept:** AidRoute Debrief — "The border intel that isn't on the internet."
Capture what convoy operators learn at each crossing, structure it, date it, and serve it back as a living corridor brief and pre-trip checklist for the next convoy.

---

## 1. What the interview established (n=1, but high-quality)

### Falsification gate verdict

| Gate | Verdict | Evidence |
|------|---------|----------|
| PIVOT (original concept) | **FIRED** | Experienced operator with a routinised process; uses ChatGPT since ~spring 2026 for inventory formalisation, commodity codes, weights, and controlled-drugs checks — "it just does it, and it does it pretty well." Eligibility/classification is a solved problem for her at ~zero cost |
| Watch-item (pain migrated to EU legs) | **FIRED, with a twist** | The pain is real at the France and Poland legs — but it is not *rule synthesis* pain. It is *rule capture* pain: the operative knowledge is unpublished |
| GO (for a different problem) | **QUALIFIED YES** | Months of disruption (April–July) from word-of-mouth border knowledge; a full day lost at the Polish border; knowledge now held by one volunteer |

### The five findings that matter

1. **Generic AI already owns the paperwork layer.** ChatGPT formalises her lists, assigns commodity codes, checks the UK controlled list, and "remembers" her process across trips. Any product competing there is competing with a free, adequate incumbent. v1 and v2 are dead on this evidence.
2. **The unsolved problem is epistemic, not synthetic.** Which Polish crossing accepts humanitarian convoys changed repeatedly; vehicle limits changed (3.5t → 7t); "there's no recorded reliable internet information on it." She tried multiple AI systems — all failed, because *models cannot know what nobody wrote down.* Resolution came by word of mouth, embassy calls, and being turned away.
3. **The T1 trap is a perfect specimen.** Customs intermediary filed bulk (cheaper per line item) → itemised listing turned out to be required to avoid an obscure "WDS" security certificate → stopped at the border for the best part of a day → resolved via an agency at the border and a duty manager waving them through. The Polish embassy didn't recognise the form. That hard-won rule now lives in one person's memory and one email thread.
4. **Unevenly distributed process knowledge.** *(Twice corrected on participant review — use this version:)* She runs the process end-to-end regularly; one or two others are "mostly on top of" the documents and process and "probably could if pushed" run it themselves; the working artefacts (the long email thread with the customs company, the Ukraine-border spreadsheet) are shared within the group, to differing degrees. The process spans ~10 acronyms (GMR, T1, V5C, ELO, EMD…) and she still flies to Poland to hand documents to drivers. Her verified words stand: handing it off "would take a lot of very careful explanation." The honest characterisation is *tacit, unevenly distributed know-how* — not a bus-factor-one story, and don't pitch it as one.
5. **Intermediaries don't absorb the burden.** The paid customs company asks the small charity what it wants filed; the charity relays what ChatGPT suggested; nobody is accountable for correctness. The expertise gap sits exactly where the operator is least equipped.

### What this kills and what it keeps

- **Kills:** manifest → eligibility → journey plan as the core product; competing with ChatGPT on published-rules synthesis.
- **Keeps:** the corridor framing, the provenance obsession (now more important, not less), the deterministic "the model never invents rules" stance, the three-screen discipline, the GDS design language.

---

## 2. The pivoted concept

**Problem statement:** The rules that stop humanitarian convoys are not the published ones — AI and Google already handle those. They are volatile, unpublished, word-of-mouth operational rules (which crossing, which form variant, which threshold changed last month). Today that knowledge is acquired by being turned away at borders, and it evaporates when the one volunteer who holds it burns out.

**Product:** After each trip, an operator gives a 5-minute debrief (voice or text). Claude extracts structured, dated intelligence claims. The system merges them into a living corridor brief — corroborating, superseding, or flagging conflicts — and generates a pre-trip checklist for the next convoy in which every line is dated and sourced as either **official guidance** or **operator-reported (n crossings, last verified date)**.

**Why AI, honestly:** not to know the answer, but to (a) make capture near-effortless — nobody writes wiki pages after a 3-day convoy, but everyone can talk for five minutes; (b) structure and reconcile messy first-person accounts; (c) keep the provenance ledger honest. The moat is the capture network, not the model.

**The line for judges:** "ChatGPT couldn't tell the operator which Polish border to use — not because the model is weak, but because nobody had written it down. Our product is how it gets written down."

**Interface validated by the participant.** On reviewing the summary, the operator independently proposed the query layer: a collated feedback system "linked up to some sort of chatbot that can answer questions." That is unprompted demand for exactly this shape of product — quote it (anonymised) in the pitch. The chatbot answers ONLY from the verified claim store plus cited official rules; where the store is silent, it says "no verified intel — here's who reported on this leg last, and when." The contrast demo writes itself: ask ChatGPT "which Polish crossing should a humanitarian convoy use?" (confident-sounding, unverifiable) vs the same question to Ask-the-Corridor (dated, sourced, or an honest refusal).

---

## 3. Build scope for tomorrow (three screens, one corridor)

**Screen 1 — "Debrief a trip"**
Paste text (or record; transcription only if trivial). Prompt hints: "What crossing did you use? What did they ask for? What surprised you?" Demo input = the operator's real accounts, anonymised with her consent.

**Screen 2 — "Corridor brief: GB → France → Poland → Ukraine"**
Cards per leg. Each intel item shows: the claim, status tag (Corroborated / Single report / Conflicting / Superseded), date last verified, source class (official vs operator-reported), and expandable detail. Freshness decay visible: items age from green to amber ("last verified 30+ days ago — treat as unconfirmed").

**Screen 3 — "Pre-trip checklist"**
Generated from the brief: documents, form variants (T1: itemise every line — avoids WDS requirement [operator-reported, last verified Jul 2026]), crossing recommendation with caveat, contacts. Printable.

**Screen 4 (stretch, build only if Screens 1–3 are demo-solid by ~15:00) — "Ask the corridor"**
Single chat input over the claim store. Implementation is deliberately thin: one API route; entire claims JSON + official-rule items passed as context; strict system prompt: *"Answer only from the provided claims and rules. Every statement must carry its source tag and last-verified date. If the claims do not cover the question, say 'No verified intel on this' and name the nearest related claim. Never draw on general knowledge for operational specifics."* Three canned demo questions rehearsed; no free-text audience questions live.

**Cut:** accounts/auth, multi-corridor, voice recording if fiddly, any automation of filings. Persistence: in-memory or a JSON file; Supabase only if free time appears.

### Architecture

```
[Debrief text]
   → LLM: claim extractor (claims + entities + dates + confidence, JSON)
   → CODE: merge engine (match against existing claims →
            corroborate / supersede / conflict; recompute freshness)
   → CODE+LLM: brief renderer & checklist generator
            (may only rephrase claims + official rules; never invent)
```

### Prompt sketches

**Claim extractor:** "You convert a convoy operator's post-trip debrief into structured intelligence claims. Output JSON: [{claim, leg: GB_EXIT|FR_TRANSIT|PL_ENTRY|UA_ENTRY, entities (crossing name, form, threshold), date_observed, first_person: bool, hearsay: bool, confidence: high|medium|low, verbatim_quote}]. Extract only what the operator reported; mark anything they heard second-hand as hearsay. Never generalise beyond the account."

**Merge engine rules (code):** same entity + compatible claim → corroborate (increment n, update last_verified); same entity + contradicting claim + newer date → supersede (keep history); contradicting + similar dates → conflict flag (surface both). Freshness = days since last_verified, thresholds 30/90 days.

**Checklist generator:** "Compose a pre-trip checklist from (a) official-rule items [cited, dated] and (b) operator-reported intel items [n reports, last verified date]. You may rephrase; you may not add, drop, or upgrade the confidence of any item. Conflicting intel must be shown as a decision the operator makes, with both accounts."

---

## 4. Demo script (3 min)

1. **Opener (30s):** "In April, a volunteer convoy was turned away from a Polish border crossing. The right crossing wasn't on GOV.UK, wasn't on the Polish government site, and wasn't in ChatGPT — the organiser tried several AI systems. It was word of mouth. She found out by being stopped, over three months of trips. Yesterday she told me the whole story in a fifteen-minute call — and that knowledge currently exists nowhere but her memory."
   *(Wording note after her clarifications: make NO claims about team dependency on stage. If asked, use only her verified quote — handover "would take a lot of very careful explanation" — and note the artefacts are shared within the group to differing degrees. The pitch's weight rests on the unpublished-knowledge problem, which both her corrections leave fully intact.)*
2. **Demo (100s):** Paste her (anonymised) debrief → extracted claims appear with dates and confidence → corridor brief updates: crossing recommendation supersedes the old one; T1 itemisation rule appears as operator-reported with the WDS context; one item flagged "single report — unconfirmed" → generate the pre-trip checklist → point at the dates and source tags on every line. *(If Screen 4 shipped: one canned question to Ask-the-Corridor, ending on the honest "no verified intel" answer — and mention the operator herself asked for this interface.)*
3. **The honest AI story (25s):** "The model never invents a rule. It structures what an operator said, and code decides whether that corroborates, supersedes, or conflicts with what we knew. Where nothing is known, the brief says so."
4. **Why it compounds (20s):** "Every convoy that debriefs makes the next convoy's checklist better. The moat isn't the model — everyone has the model. It's the capture loop."
5. **Responsible use (15s):** "Procedural intel only: forms, crossings, thresholds. Never future convoy timings, routes, loads or identities — a database of upcoming humanitarian movements would be a targeting risk, so we've designed it out."

## 5. Anticipated judge challenges

| Challenge | Answer |
|-----------|--------|
| "Isn't this just a wiki/forum?" | Wikis fail on capture effort and on staleness. The debrief loop makes capture a 5-minute voice note; the merge engine makes staleness visible instead of silent. The Facebook groups where this knowledge lives today have no structure, no dates, no reconciliation |
| "n=1 interview" | Correct — this is a hypothesis with one strong case and a mechanism (AI fails precisely where information is unrecorded) that generalises. Next step stated openly: five more operator debriefs |
| "Why will operators contribute?" | Reciprocity at the moment of maximum motivation (just crossed, fresh frustration) plus immediate value back (their own org's process, currently tacit and unevenly shared, gets turned into a documented playbook from their own debriefs — making handover far less dependent on "a lot of very careful explanation") |
| "OPSEC?" | Access-controlled community, procedural intel only, no forward-looking movement data, anonymised by default |
| "Isn't the chatbot just RAG?" | The bot is the cheap part and deliberately thin. The asset is the verified, dated, reconciled claim store underneath — which doesn't exist anywhere today. Same bot over Google's index is what ChatGPT already is, and it failed this exact question |

## 6. Tonight / tomorrow-morning actions

1. ~~Contact participant for consent~~ **DONE — consent secured** for sharing the anonymised summary with the group; she validated the summary with clarifications (she runs the process end-to-end regularly; others are partially across it; artefacts are shared to differing degrees) and independently proposed the chatbot query layer.
2. Write up her debrief as the seed dataset: 8–12 claims across the four legs, including the Polish crossing saga and the T1/WDS rule, each with dates.
3. Add 2–3 official-rule items (GB simplified process, controlled goods) so the brief visibly mixes both source classes.
4. Prepare a second, shorter fictional debrief that *conflicts* with one claim — that's your merge-engine demo moment.
5. Morning scope-lock with the team: three screens, one corridor, rehearsed demo path, backup recording.
