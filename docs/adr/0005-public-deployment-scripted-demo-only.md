# The public deployment runs the rehearsed demo only, behind an opt-in live flag

The Anthropic API key has been deleted. <https://www.aidroute.org> stays up as
a guided demo of one rehearsed scenario: no key on the deployment, no live
model calls, no running cost. Live extraction, free-typed questions and
unrehearsed checklist generation remain available locally.

Most of this already existed — the rehearsed path is served from frozen
fixtures in `data/canned/` and never needed a key. What did not exist was a
*boundary*. Three routes called the model whenever a fixture missed
(`/api/extract` on any text that doesn't start with the frozen debrief,
`/api/ask` on anything but the three chips, `/api/checklist` on any store
state the fixture wasn't frozen against), `callClaude` threw on a missing or
rejected key, and the client rendered that throw in the red error style. With
no key, every one of those paths was a red error on a public site — including
the plain checklist, every night between the 03:00 reseed and the first
visitor to run the sample.

**The switch is opt-in, not inferred.** `isLiveLlmEnabled()` (`lib/live-mode.ts`)
requires `AIDROUTE_LIVE_LLM=on` **and** a key. Keying off the key alone would
mean that re-adding `ANTHROPIC_API_KEY` to Vercel for any reason silently
reopens spend on a public URL; two independent switches make that a decision
rather than an accident. `x-force-live: 1`, which the freeze script uses to
regenerate fixtures, is honoured only when live mode is on — otherwise any
caller could step off the rehearsed path.

**Unrehearsed input is answered, not rejected.** With live mode off and no
canned or cached answer, routes return HTTP **200** with `{ demo_only: true,
message }` (per leg, for the checklist) instead of calling the model. A 4xx
would have been more literal, but the client's `readApiJson` turns every
non-2xx into a thrown error and the pages render thrown errors in red — so the
status code is what decides whether a visitor reads "this demo runs a
rehearsed scenario" or "something went wrong". 200-plus-flag keeps
`readApiJson` untouched and lets each page render a neutral notice with a
route back to the guided path.

**A dead key degrades the same way.** `callClaude` now throws
`LiveLlmUnavailableError` when the key is missing or the API answers 401/403,
and all three routes catch that one type and return the demo-only payload
(logging server-side). So a stale or revoked key — the exact situation that
prompted this — degrades to the demo notice rather than a red error, with or
without the flag. Other failures (429, 5xx, timeouts) stay ordinary errors
that invite a retry.

**Nothing free-typed is persisted.** `logDebrief` / `logAsk` only ever ran
after a successful response; in demo mode the routes now return before the
store is touched at all. The debrief box is labelled "Tell us about the trip"
and a visitor may type real names and places into it, so this is pinned by
tests rather than left as an emergent property.

**The shared store needed a second state, not a second fixture.** The deployed
store is shared across visitors and visitors cannot reset it (reset requires
`ADMIN_TOKEN`, and `CRON_SECRET` is set for the nightly cron, so the public
"Reset demo" button is restricted). A test merging the canned extraction twice
from seed showed the fingerprint does change — the FR-001 corroboration takes
`n_reports` 2 → 3 — which means the first visitor to run the sample twice
would leave the canned checklist unmatchable for everyone else until 03:00. In
demo mode `/api/merge` therefore resets to seed before merging the rehearsed
sample, so the store is only ever in one of two states: seed, or
post-sample-merge. Freezing a second checklist fixture for the twice-merged
state would have worked for exactly one more repeat; the reset bounds it for
all of them. Nothing else can mutate the store in demo mode, so the reset
loses nothing. Live mode is unchanged: real debriefs accumulate.

The costs are real and accepted. A visitor cannot try their own debrief or
their own question on the public site — the thing the product is actually for
— and sees a notice instead; the demo is a walkthrough, not a trial. The
rehearsed path is now the only path, so fixture drift breaks the whole site
rather than one feature, which is why the fixture guards
(`tests/fixtures.test.ts`), the sample-text equality test and `demo-check`
matter more than they did. And the deployment must keep **both**
`ANTHROPIC_API_KEY` and `AIDROUTE_LIVE_LLM` unset: a reviewer who "fixes" the
demo by adding a key back gets nothing (the flag is still off), and one who
sets both gets a public URL spending money.
