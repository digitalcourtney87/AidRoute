# AidRoute

Corridor intelligence for humanitarian aid convoys: operators debrief after each trip, the system extracts dated claims, merges them deterministically, and serves a living brief that never guesses.

## Language

### Intelligence

**Operator Claim**:
A single dated, structured statement of corridor intelligence extracted from a Debrief and owned by the merge engine thereafter.
_Avoid_: report, tip, entry

**Official Rule**:
A statement sourced from a published authority, held alongside claims but never merged with them.
_Avoid_: regulation, law

**Corridor**:
The route-scoped unit of intelligence — all claims, rules, and trail records belong to exactly one corridor. Currently only GB→UA via PL exists.
_Avoid_: route, region

**Leg**:
One of the four fixed journey stages of a corridor (GB exit, FR transit, PL entry, UA entry) that every claim and rule is pinned to.
_Avoid_: stage, segment

**Freshness**:
How recently a claim was last verified, decaying over time; drives the brief's visual confidence cues.
_Avoid_: recency, age

### Capture

**Debrief**:
A post-trip account given by an operator in their own words, typed or spoken — the raw source from which claims are extracted. When spoken, the transcript is the debrief; voice is an input method, not an artifact, and audio is never kept.
_Avoid_: interview, submission, report, recording

**Capture Trail**:
The append-only record of how intelligence entered the system: debriefs, merge events, and ask logs.
_Avoid_: audit log, history

**Merge Event**:
One deterministic decision made by the merge engine about one extracted claim: created, corroborated, superseded, or conflict.
_Avoid_: merge log entry, action

**Gap Signal**:
An Ask question the corridor could not answer from verified intel — the tasking signal for what to collect next.
_Avoid_: miss, unanswered question

**Retention Window**:
The bounded lifetime of raw operator and asker text (30 days). Structured claims and the shape of the trail persist; verbatim speech does not.
_Avoid_: TTL, expiry
