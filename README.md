# AidRoute Debrief

**"The border intel that isn't on the internet."**

A one-day build for the Frontline London Hackathon (Sat 16 Aug 2026 — humanitarian / civic resilience track).

**Live demo:** <https://aid-route-g8f7v4462-digitalcourtney87s-projects.vercel.app/>

> The deployed site runs the full merge demo when its Supabase backend is configured (see **Persistence** below) — state persists and is shared across serverless instances, reseeding nightly. Without that config, deployments fall back to the in-memory store, which serverless instances don't share; the local rehearsed demo always runs in-memory by design.

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
4. **Answers** questions ("Ask the corridor") **only** from the verified claim store — and says "no verified intel on this" rather than guessing

The moat is the capture loop, not the model.

## Quick start

```bash
npm install
npm run build
npm start
```

Open <http://localhost:3000>. The rehearsed demo path — pasting the demo debrief from `data/seed-data.json`, generating the default checklist, and the three suggested Ask questions — is served from frozen fixtures in `data/canned/` and **works entirely offline, no API key required**.

To enable live extraction of unrehearsed debriefs and free-typed questions:

```bash
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
```

## Persistence (Supabase, optional)

The claim store has two interchangeable backends ([ADR-0002](docs/adr/0002-dual-backend-claim-store.md)):

- **In-memory (default)** — no env vars, no network. This is the offline rehearsed-demo mode and the mode all tests run in. Nothing about the original demo behaviour changes.
- **Supabase Postgres** — set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and the store becomes persistent and shared across serverless instances (the deployed merge demo works). Merges are concurrency-safe via optimistic versioning, and a **capture trail** (raw debriefs, merge events, ask logs) is recorded append-only — raw text lives 30 days, then it's gone ([ADR-0001](docs/adr/0001-verbatim-capture-with-retention-window.md)).

One-time setup for a hosted project (EU/UK region):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # applies supabase/migrations/
npm run db:seed             # seeds from data/seed-data.json (also = full reseed)
```

On Vercel, additionally set `ADMIN_TOKEN` (protects `/api/reset` — send it as `x-admin-token`) and `CRON_SECRET` (lets the nightly cron in `vercel.json` reseed the sandbox). Locally, leave both unset and reset stays open. All database access is server-side with the service role; RLS is deny-all and no Supabase key ever reaches the browser.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Production server — **use this for the demo**, not `npm run dev` (dev-mode module reloading can reset the in-memory store and bypass the instant canned path) |
| `npm run dev` | Dev server with hot reload, for development only |
| `npm test` | 55 unit tests: merge-engine rules against the seed file's oracle, citation validators, fixture guards |
| `npm run demo-check` | Pre-rehearsal gate — hits every route with the demo inputs and asserts canned, schema-valid, oracle-exact responses. Run it before every rehearsal; it passes with no API key |
| `npm run freeze-fixtures` | Regenerates `data/canned/` from the live routes (needs a running server + API key); `-- --keep-extraction` re-freezes the checklist only, `-- --ask-only` just the three questions |
| `npm run smoke:extract` | One live extraction round-trip, for checking the API key works |
| `npm run db:seed` | Seeds/reseeds the Supabase store from `data/seed-data.json` (needs `SUPABASE_*` in `.env.local`; never touches the capture trail) |

If `npm test` errors on a fresh machine, run `npm rebuild esbuild` first (install scripts are blocked by default; only vitest needs it).

## Repo contents

| Path | What it is |
|------|------------|
| `app/` | The four screens (debrief, corridor brief, checklist, Ask the corridor) and their API routes |
| `lib/` | The deterministic merge engine, in-memory claim store, prompts, Anthropic wrapper, and citation validators — every truth decision lives here, in tested pure functions |
| `data/seed-data.json` | Anonymised seed claims from the interview + official rules + a clearly-marked fictional second debrief that drives the merge demo |
| `data/canned/` | Frozen demo fixtures, curated to the seed file's expected outcomes and pinned by tests |
| `scripts/` | Fixture freezing, demo-check, smoke test |
| `tests/` | Vitest suite (55 tests) |
| `docs/01-background-plan-v2.md` | The pre-interview plan (superseded) — kept for context on how validation changed the product |
| `docs/02-pivot-plan-v3.md` | Current concept, interview findings, demo script, judge Q&A |
| `docs/03-technical-handoff.md` | The implementation spec this build was executed from |

## Principles (non-negotiable)

- The model never invents a rule; code makes every truth decision; every rendered statement cites a dated source
- Procedural/historical intel only — **never** forward-looking convoy movements, routes, loads or identities (targeting risk)
- Research participants stay anonymous everywhere in this repo and the demo
- Honest gaps ("needs verification") are a feature, not an error state
