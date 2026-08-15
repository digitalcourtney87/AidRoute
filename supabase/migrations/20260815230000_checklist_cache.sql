-- Checklist cache — one generated section per (store fingerprint, leg).
--
-- The fingerprint (lib/canned.ts storeFingerprint) changes whenever any claim
-- is created, corroborated, superseded, or conflicted, so invalidation is
-- structural: rows for a previous store state simply never match again. The
-- app prunes non-current-fingerprint rows on write to keep the table tiny.
--
-- Same access model as everything else: service-role-only, RLS enabled with
-- no policies (deny-by-default for anon/authenticated).
create table checklist_cache (
  store_fingerprint text not null,
  leg text not null,
  section jsonb not null,
  created_at timestamptz not null default now(),
  primary key (store_fingerprint, leg)
);

alter table checklist_cache enable row level security;
