# AidRoute Debrief

**"The border intel that isn't on the internet."**

A one-day build for the Frontline London Hackathon (Sat 16 Aug 2026 — humanitarian / civic resilience track).

## The problem (validated this week)

UK volunteer convoys moving humanitarian aid to Ukraine have largely solved the *paperwork* problem — generic AI tools already draft inventories, assign commodity codes and check controlled-goods lists well.

What remains unsolved is the knowledge that is **not published anywhere**:

- Which Polish border crossing humanitarian convoys should use changed repeatedly this spring; operators were turned away with "wrong border" and no explanation. Nothing reliable was online — multiple AI tools failed on the question because the information simply wasn't recorded.
- A transit-form filing choice (bulk total vs itemised lines on the T1) turned out to trigger an obscure additional certificate; one convoy lost the best part of a day at the border learning this. The fix isn't written down anywhere official.
- Vehicle weight limits at crossings changed without any traceable publication.

This evidence comes from a structured interview (14 Aug) with an experienced volunteer convoy organiser, who reviewed and validated our anonymised summary and independently suggested part of this product ("a collated feedback system linked to a chatbot that can answer questions"). n=1, stated openly — the mechanism (AI cannot know what nobody wrote down) is the generalisable part.

## The product

After each trip, an operator gives a 5-minute debrief. The system:

1. **Extracts** structured, dated intelligence claims (Claude API)
2. **Merges** them deterministically in code — corroborate / supersede / conflict — never letting the model decide what's true
3. **Serves** a living corridor brief + generated pre-trip checklist where every line shows its source class (official vs operator-reported), report count, and last-verified date with freshness decay
4. *(Stretch)* An "Ask the corridor" chatbot that answers **only** from the verified claim store — and says "no verified intel on this" rather than guessing

The moat is the capture loop, not the model.

## Repo contents

| Path | What it is |
|------|------------|
| `docs/01-background-plan-v2.md` | The pre-interview plan (superseded) — kept for context on how validation changed the product |
| `docs/02-pivot-plan-v3.md` | Current concept, interview findings, demo script, judge Q&A |
| `docs/03-technical-handoff.md` | Full implementation spec, ready for Claude Code: architecture, merge-engine rules, prompts, screens, build order |
| `data/seed-data.json` | Anonymised seed claims from the interview + official rules + a clearly-marked fictional second debrief that drives the merge demo |

## Team roles needed on the day

- **Build** — Next.js/TypeScript; the technical handoff is written to be executed with Claude Code
- **Rules & prompts** — own the merge engine tests and citation validation
- **Design & pitch** — GDS-inspired UI polish, 3-minute demo script (drafted in docs/02)

## Principles (non-negotiable)

- The model never invents a rule; code makes every truth decision; every rendered statement cites a dated source
- Procedural/historical intel only — **never** forward-looking convoy movements, routes, loads or identities (targeting risk)
- Research participants stay anonymous everywhere in this repo and the demo
- Honest gaps ("needs verification") are a feature, not an error state

## Quick start (once scaffolded)

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev
```
