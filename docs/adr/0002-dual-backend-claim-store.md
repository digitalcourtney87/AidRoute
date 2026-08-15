# Dual-backend claim store: in-memory is a first-class mode, not a fallback

The claim store has two interchangeable backends behind `lib/store.ts`:
in-memory (default, no env vars) and Supabase Postgres (selected when
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set). A reasonable reader
would expect the database to replace the in-memory store; it deliberately
does not.

The offline rehearsed demo is a product feature: it must run with no network,
no Docker, no API keys, guarded by `demo-check` and the fixture-pinned tests.
A single Supabase-only code path would make the demo depend on a local
Postgres stack being up and migrated — exactly the fragility the demo
discipline exists to avoid. So tests and the demo machine run in-memory,
byte-identical to the original store, while deployed instances get
persistence, concurrency-safe merges (optimistic versioning in
`replace_claims`), and the capture trail.

The cost: every store mutation ships twice. The merge engine does not — all
truth decisions stay in pure `lib/merge.ts`, and backends only load and
persist what it returns. Do not "simplify" by deleting the in-memory backend;
that trades away the demo's zero-dependency guarantee.
