# Handoff: AidRoute public site → scripted demo only

**Repo:** `digitalcourtney87/aidroute` (Next.js, deployed on Vercel at https://www.aidroute.org)
**Branch to create:** `feat/scripted-demo-mode` → PR into `main`
**Owner decision (final):** the public deployment runs the rehearsed demo only. No live LLM calls, no API key on the deployment.

---

## Prompt to paste into Claude Code

> Read `docs/05-scripted-demo-handoff.md` in full before changing anything. Implement it on a new branch `feat/scripted-demo-mode`, in the task order given, with small conventional commits. Verify every claim in §2 against the code first and stop and report if any is wrong. Do not add features beyond §4. Finish by running the §6 checks and reporting each acceptance criterion as pass/fail with evidence, then open a PR.

(Save this file in the repo as `docs/05-scripted-demo-handoff.md` first.)

---

## 1. Why

The Anthropic API key has been deleted. The public site must keep working as a guided demo, with no running cost and no key on the deployment. The repo already supports most of this: the rehearsed path is served from frozen fixtures in `data/canned/`, and the README says it "works entirely offline, no API key required". The work is to (a) make "demo only" an explicit, safe mode, (b) remove every visitor path that can still reach the LLM and fail, and (c) guide visitors onto the path that works.

## 2. Current behaviour (verified 18 Oct 2026 — re-verify before coding)

| Area | Fact | Where |
|---|---|---|
| LLM calls | Only three routes call `callClaude`: extract, ask, checklist (plus `scripts/smoke-extract.ts`) | `app/api/{extract,ask,checklist}/route.ts` |
| Key handling | `callClaude` throws if `ANTHROPIC_API_KEY` is unset; throws `Claude API <status>` on non-2xx (so a revoked key → 401 → error) | `lib/anthropic.ts` |
| Extract | Canned only if the text **starts with** the fixture's `input_startswith`; otherwise live. `x-force-live: 1` skips canned | `app/api/extract/route.ts`, `lib/canned.ts` |
| Ask | Canned only for an exact (trimmed, case-insensitive) match to the three `SUGGESTED_QUESTIONS` chips; otherwise live | `app/api/ask/route.ts`, `lib/ask.ts` |
| Checklist | Per leg: canned **only when the store fingerprint equals the post-demo-merge state** → cache → live | `app/api/checklist/route.ts`, `getCannedChecklistLeg` |
| Merge | Deterministic, no LLM | `lib/merge.ts`, `app/api/merge/route.ts` |
| Sample debrief text | `data/seed-data.json` → `demo_debrief_2.raw_text`. **No UI control loads it** — a visitor has to paste it, and has no way to know it | `app/page.tsx` |
| Reset | Requires a token if `ADMIN_TOKEN` **or** `CRON_SECRET` is set. `CRON_SECRET` is needed for the nightly cron, so on Vercel the public "Reset demo" button is effectively restricted | `app/api/reset/route.ts`, `vercel.json` |
| Errors | Client `readApiJson` throws on non-2xx; pages render the message in the red `noticeError` style | `lib/read-api-json.ts` |

### Gaps this creates with no key

1. **Free-typed debriefs and questions** → live path → red error.
2. **Checklist in seed state** (after the 03:00 reseed, before anyone runs the sample) → fingerprint mismatch → cache miss → live → red error.
3. **Repeat runs on the shared store:** the Supabase store is shared across visitors and visitors can't reset it. If merging the sample a second time changes the fingerprint (e.g. corroboration increments `n_reports`), the canned checklist stops matching for everyone until 03:00. **Verify this** with a test before choosing the fix in T4.
4. **`x-force-live: 1`** lets any caller bypass canned fixtures.
5. **Discoverability:** nothing tells a visitor which inputs work.

## 3. Design

### 3.1 Explicit mode switch (default: demo)

Add `lib/live-mode.ts`:

```ts
export function isLiveLlmEnabled(): boolean {
  return process.env.AIDROUTE_LIVE_LLM === "on" && Boolean(process.env.ANTHROPIC_API_KEY);
}
```

- **Opt-in, not inferred from the key alone,** so re-adding a key to Vercel by accident does not reopen spend.
- Local development with live calls: `AIDROUTE_LIVE_LLM=on` + `ANTHROPIC_API_KEY` in `.env.local`. `freeze-fixtures` and `smoke:extract` must keep working in that configuration.
- `x-force-live: 1` is honoured **only** when `isLiveLlmEnabled()`.

### 3.2 Demo-only response contract

When live is disabled and no canned/cached answer exists, routes return **HTTP 200** with a neutral payload instead of calling the model:

```jsonc
// /api/extract
{ "demo_only": true, "message": "Live extraction is switched off in this public demo. Load the sample debrief to see how it works." }
// /api/ask
{ "demo_only": true, "message": "Free-typed questions are switched off in this public demo. Try one of the suggested questions." }
// /api/checklist — per leg, alongside canned/cached legs
{ "leg": "…", "title": "…", "items": [], "demo_only": true,
  "message": "This section is built from the merged brief. Run the sample debrief first." }
```

200 + flag keeps `readApiJson` unchanged and lets pages render a neutral notice rather than an error. Record the choice in ADR 0005.

### 3.3 Defence in depth

In `lib/anthropic.ts`, introduce a typed `LiveLlmUnavailableError` thrown when the key is missing **or** the API returns 401/403. Routes catch it and return the §3.2 payload (logging server-side). This means a stale or revoked key in Vercel degrades to demo mode, not to a red error.

### 3.4 Privacy

In demo mode, **free-typed visitor text must never be persisted**. Today `logDebrief`/`logAsk` only run after a successful (canned or live) response; keep it that way and pin it with tests. Visitors may type real names or places into a box labelled "Tell us about the trip".

## 4. Tasks (in order)

**T1 — Mode switch.** Add `lib/live-mode.ts`; gate all three routes and `x-force-live` on it. Update `.env.example` with `AIDROUTE_LIVE_LLM` (commented, default off) and a note that the public deployment must leave both it and the key unset.

**T2 — Route behaviour.** Extract and ask: canned → else (live enabled ? live : demo_only). Checklist per leg: canned → cache → else (live enabled ? live : demo_only section). Add `LiveLlmUnavailableError` handling (§3.3) in all three.

**T3 — Sample-debrief affordance.** Add `lib/demo-sample.ts` exporting the sample text (do **not** import the whole `seed-data.json` into the client bundle). Add a test asserting it equals `seed-data.json` → `demo_debrief_2.raw_text`, so they can't drift. On `/`, add a **"Use the sample debrief"** button that fills the textarea, plus a one-line explainer that this is a public demo running a rehearsed scenario.

**T4 — Shared-store state.** First write a test: merge the canned extraction twice from seed and compare fingerprints.
- If the fingerprint is stable → no change needed; record the result.
- If it changes → in demo mode, when `/api/merge` receives the canned sample extraction, **reset to seed before merging**, so the store can only ever be in two states: seed or post-sample-merge. (Nothing else can mutate the store in demo mode, so the reset loses nothing.) Prefer this over freezing extra fixtures. Document it in ADR 0005.

**T5 — UI states.**
- `/`: render `demo_only` as a neutral notice (not `noticeError`) with a "Load the sample debrief" button.
- `/ask`: neutral notice pointing to the three chips.
- `/checklist`: add a `demo_only` leg state rendered neutrally, with a link to `/` ("Run the sample debrief first").
- A small, persistent line (footer or under the nav): "Public demo · rehearsed scenario · anonymised and fictional data · resets nightly." Keep it in the existing design language; no new components unless necessary.
- If reset is restricted, the existing "Reset demo" message stays. Do not hide the button in this PR.

**T6 — Tests (Vitest, existing mocks).** At minimum:
- `live-mode`: off by default; off with key but no flag; off with flag but no key; on with both.
- extract/ask/checklist in demo mode: non-canned input → 200 `demo_only`; **no `fetch` to api.anthropic.com** (assert via the existing fetch mock); `logDebrief`/`logAsk` not called.
- `x-force-live: 1` ignored in demo mode.
- `LiveLlmUnavailableError` on 401 → `demo_only` response.
- Sample text equality (T3) and the T4 fingerprint test.
- Existing live-path tests still pass with live mode enabled in the test env.

**T7 — demo-check.** Extend `scripts/demo-check.ts`:
- Free-typed extract and ask → `demo_only: true`, status 200.
- Checklist from seed state → no error status; each leg is canned or `demo_only`.
- Send `ADMIN_TOKEN` (from env, if set) as `x-admin-token` on reset calls, so the script can run against production: `BASE_URL=https://www.aidroute.org ADMIN_TOKEN=… npm run demo-check`.

**T8 — Docs.**
- `docs/adr/0005-public-deployment-scripted-demo-only.md`: context (key deleted, cost and exposure), decision (§3.1–3.4, T4 outcome), consequences (no unrehearsed input on the public site; live mode remains available locally).
- README: under **Live demo**, state that the public site is a guided demo of a rehearsed scenario; update the env-var section and the Vercel notes (no `ANTHROPIC_API_KEY`, no `AIDROUTE_LIVE_LLM` on the deployment).

## 5. Manual steps for Courtney (Claude Code cannot do these)

1. **Vercel → AidRoute project → Environment Variables:** delete `ANTHROPIC_API_KEY` from **all** environments (Production, Preview, Development). Do not add `AIDROUTE_LIVE_LLM`.
2. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` and `ADMIN_TOKEN` as they are.
3. Merge the PR and let Vercel redeploy.
4. Run the production check: `BASE_URL=https://www.aidroute.org ADMIN_TOKEN=<value> npm run demo-check`.
5. Walk the guided path once in a private browser window: sample debrief → brief → checklist → the three Ask chips. Then type a free-text question and confirm the neutral notice.

## 6. Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| A1 | With `ANTHROPIC_API_KEY` unset, **and** with it set to an invalid value, no visitor action returns a 4xx/5xx from extract, ask or checklist | Tests + local `npm run demo-check` |
| A2 | No request reaches `api.anthropic.com` in demo mode, including with `x-force-live: 1` | Fetch-mock assertions |
| A3 | Guided path works end to end from seed state **and** after it has already been run once | demo-check + T4 test |
| A4 | Free-typed input gets a neutral notice with a route back to the guided path; nothing free-typed is persisted | Tests + manual walk-through |
| A5 | Live mode still works locally with `AIDROUTE_LIVE_LLM=on` + key | Existing live-path tests pass with flag on |
| A6 | `npm test`, `npm run build` and local `npm run demo-check` (no key) all pass | Command output in PR description |
| A7 | ADR 0005 and README updated; `.env.example` documents the flag | Diff |

## 7. Out of scope

Rate limiting, a new LLM provider, per-visitor sessions, visual redesign, changes to the merge engine's rules, changes to Supabase schema beyond what T4 strictly needs.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Fixtures drift from seed data | Existing fixture tests + new sample-text equality test |
| A future key re-added to Vercel silently re-enables spend | Opt-in flag (§3.1); ADR states the deployment must not set it |
| Shared store leaves the checklist unusable for later visitors | T4 test and reset-before-merge |
| Visitors type personal details into the debrief box | No persistence of free text in demo mode (§3.4), pinned by tests |
