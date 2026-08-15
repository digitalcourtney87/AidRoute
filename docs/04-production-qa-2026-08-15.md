# QA report — aid-route-five.vercel.app

- **Date:** 2026-08-15
- **Target:** https://aid-route-five.vercel.app/
- **Mode:** Originally report-only. Root cause pinned from Vercel runtime
  logs; code remediations for ISSUE-001–005 are in this branch.
- **Framework:** Next.js 15 (App Router) on Vercel
- **Pages visited:** 4 (`/`, `/brief`, `/checklist`, `/ask`)
- **API routes probed:** 5 (`/api/extract`, `/api/ask`, `/api/checklist`, `/api/merge`, `/api/reset`)
- **Health score:** 34 / 100

## Summary

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 2 |
| Medium | 2 |

Every feature backed by the live claim store is broken in production. The frozen
demo fixtures still work, which is what makes the failure easy to miss: click a
suggested chip and the app looks healthy; type your own question and it breaks.

## Observed status matrix

| Path | Result | User sees |
|---|---|---|
| `POST /api/extract` (canned input) | 200 | Works |
| `POST /api/ask` (chip question) | 200 | Works — full grounded answer |
| `POST /api/extract` (real debrief) | 422 | "Couldn't extract intel… Check the connection" |
| `POST /api/ask` (typed question) | **500, empty body** | Raw JS error |
| `POST /api/checklist` | **500, empty body** | Raw JS error |
| `POST /api/merge` | 503 | "Couldn't apply the merge just now" |
| `GET /brief` | **500** | Bare white Next.js crash page |
| `POST /api/reset` | 401 | "Reset is restricted" (intentional — `ADMIN_TOKEN` is set) |

## Root cause (pinned from Vercel logs, 2026-08-15)

Every live store path throws:

```
get_corridor_state failed: TypeError: Headers.set: "<jwt>\n<jwt>\n<truncated jwt>"
is an invalid header value.
```

`SUPABASE_SERVICE_ROLE_KEY` in Vercel is the service-role JWT pasted **three
times**, joined by newlines. Fetch `Headers.set` rejects CR/LF in header
values, so the Supabase client never leaves the process. The project ref
inside the JWT is the live AidRoute project (`nwpcwwrhsmabrwwvhnfr`) — this
is not a wrong-project or rotated-key failure.

The first copy is a well-formed JWT. Code now takes the first JWT and
strips whitespace before `createClient`, so a deploy unblocks the store even
before the env var is cleaned. **Still rotate the key**: it is now in Vercel
runtime logs.

What is **not** the cause (each checked and ruled out):

- **Supabase project down** — project `AidRoute` (`nwpcwwrhsmabrwwvhnfr`, eu-central-1)
  reports `ACTIVE_HEALTHY`.
- **Migrations not applied** — all three are on the hosted DB:
  `20260815180000`, `20260815213000`, `20260815220000`.
- **Missing hosted RPC fix** — `f03ee2d` ("Fix hosted-Supabase RPC failures")
  is merged into `main`.
- **Bad model ID** — `claude-sonnet-4-6` in [`lib/anthropic.ts:6`](lib/anthropic.ts:6)
  is a valid current model, and `temperature: 0` is still permitted on it.
- **Missing seed file in the bundle** — disproved because canned paths return 200.

Evidence that selected the Supabase backend (unchanged):

1. [`lib/store-memory.ts`](lib/store-memory.ts) calls `loadSeed()` at module load.
   `lib/store.ts` imports that module unconditionally, so a missing seed file
   would 500 every route — including the canned ones.
2. The canned paths return **200**. So `lib/store` imported cleanly.
3. Every path that actually *reads* the store failed, until the header value
   was shown to contain newlines.

## Findings

### ISSUE-001 — Critical — every live feature is down
All non-canned paths fail. The app is demo-only: rehearsed inputs work, real
input does not.
**Repro:** type any debrief on `/` → "Extract intel" → error banner (`422`).

### ISSUE-002 — Critical — `/brief` renders a bare crash page
[`app/brief/page.tsx:171`](app/brief/page.tsx:171) awaits `getState()` in a
server component with no error boundary, so the whole route 500s. The user gets
an unstyled white page: *"Application error: a server-side exception has occurred"*
— no nav, no branding, no way back.
**Repro:** open https://aid-route-five.vercel.app/brief

### ISSUE-003 — High — `/api/ask` and `/api/checklist` return 500 with an empty body
The store reads sit **outside** the try block:
[`app/api/ask/route.ts:30-31`](app/api/ask/route.ts:30) and
[`app/api/checklist/route.ts:17`](app/api/checklist/route.ts:17). A throw there
is an unhandled rejection, so Next returns a raw 500 with no JSON.

This is the *same* defect already fixed for extract in `2515407` — the fix was
never applied to the other two routes. The comment at
[`app/api/extract/route.ts:36-37`](app/api/extract/route.ts:36) describes exactly
this hazard.

### ISSUE-004 — High — raw JS error leaks to the user
Because the 500 body is empty, the client's `res.json()` throws, and the page
renders the exception text verbatim:

> Failed to execute 'json' on 'Response': Unexpected end of JSON input

Shown on both `/checklist` and `/ask`. ISSUE-003 is the cause; this is what the
user actually sees.

### ISSUE-005 — Medium — misleading error copy on extract
[`app/api/extract/route.ts:58-67`](app/api/extract/route.ts:58) catches store
failures, Claude failures, and validation failures identically and returns
"Check the connection and try again — or rephrase the account." The connection
is fine and rephrasing cannot help — the store is down. This sends the operator
down the wrong path.

### ISSUE-006 — Medium — the Claude integration is completely unverified
Every live route reads the store *before* calling `callClaude()`, so no request
has ever reached Anthropic in this deployment. Whether `ANTHROPIC_API_KEY` is
set and valid in Vercel is **unknown** — fixing the store may simply expose a
second failure behind it.

## What works

- All 4 routes serve and render; nav, styling, and mobile layout are correct.
- Zero console errors on a clean page load.
- No broken links.
- Canned demo fixtures are excellent — the Ask answer is well-formed, cited,
  and honest about gaps.
- `/api/reset` is correctly locked down.
- Empty-input validation returns a proper `400`.

## Remediation (applied in code)

| Issue | Change |
|---|---|
| ISSUE-001 | `lib/supabase-env.ts` takes the first JWT from a whitespace-duplicated key and trims `SUPABASE_URL`. |
| ISSUE-002 | `app/error.tsx` keeps nav/branding when `/brief` (or any server page) throws. |
| ISSUE-003 | Store reads on `/api/ask` and `/api/checklist` sit inside the try, matching extract. |
| ISSUE-004 | Clients parse via `readApiJson` — empty 500s no longer leak a JS exception. |
| ISSUE-005 | Store failures return "The corridor store is unavailable…" instead of "rephrase". |
| Secrets in logs | RPC errors run through `redactSecrets` before throw/log. |

**Operator action still required:** rotate the leaked service-role key in
Supabase, paste the new value **once** into Vercel `SUPABASE_SERVICE_ROLE_KEY`,
and redeploy. Then hit a typed `/api/ask` to confirm Anthropic (ISSUE-006).

