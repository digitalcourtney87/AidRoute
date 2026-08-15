# Per-leg checklist generation, fanned out by the client and cached by store fingerprint

The pre-trip checklist is generated one Leg at a time — four Claude calls for
a full-corridor journey, not one — and the client fires them in parallel, one
HTTP request per leg. A reasonable reader would expect a single call producing
the whole document; it deliberately does not.

Operators declare a Journey Span (start point + destination) that selects a
contiguous run of legs, so most trips need a subset of the corridor. Once the
work is per-leg, three things follow that a monolithic call cannot give:
wall-clock drops to the slowest *single* leg instead of the sum of all four; a
narrow span (Poland → Ukraine is one leg) is genuinely cheap rather than
merely filtered after the fact; and a leg that fails degrades to a retry on
that section alone while the rest of the checklist stands.

Streaming one call was the alternative. It improves *perceived* latency only —
the last leg still lands at the same moment — and pushing partial JSON through
the citation validator means either validating incomplete objects or buffering
until the end, which is where the safety guarantee lives. Client-driven
fan-out gets progressive rendering for free with plain `fetch`, and keeps the
route a request/response function with no new protocol.

Splitting per leg is safe because the merge engine only ever pairs conflicting
claims within one leg (`lib/merge.ts`), so no per-leg call can separate a pair
that must be presented together.

Results are cached in the store, keyed `(store fingerprint, leg)`. The
fingerprint already existed to gate the canned demo fixture, and it changes
whenever any claim is created, corroborated, superseded, or conflicted — so
invalidation is structural rather than a TTL: rows for a previous store state
simply never match again, and writes prune them. On serverless the cache must
be shared to be worth anything (per-instance memory dies with the lambda),
which is why it is a table with an in-memory mirror rather than a module-level
Map.

The costs: four calls bill four sets of input tokens for a full corridor,
where one call amortised the store across all four legs; and the canned demo
fixture had to be looked up per leg so narrow spans stay on the instant
pre-verified path. Do not "simplify" back to one call to save tokens — that
trades the span feature's whole point, and the honest-gap path (a leg with no
intel skips the model entirely) exists only because the work is per-leg.
