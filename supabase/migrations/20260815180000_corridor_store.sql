-- AidRoute corridor store — initial schema.
--
-- Access model: the app talks to Postgres exclusively through the service
-- role (server-side). RLS is enabled on every table with NO policies, so the
-- anon and authenticated roles can reach nothing; execute on the RPCs is
-- revoked from them too. Deny-by-default, service-role-only.
--
-- Dates are TEXT, not DATE: the domain allows month precision ("2026-02")
-- and all parsing/freshness logic lives in the app (lib/freshness.ts).

-- ---------------------------------------------------------------------------
-- Corridor: the tenancy unit and the optimistic-concurrency anchor. One row
-- today (GB→UA via PL). `version` increments on every claims write; the
-- replace_claims RPC rejects writes made against a stale version so
-- concurrent merges can never silently drop each other's claims.
create table corridor (
  id text primary key,
  version bigint not null default 0
);

insert into corridor (id) values ('gb-ua-pl');

create table official_rules (
  id text primary key,
  leg text not null,
  source_class text not null default 'official',
  claim text not null,
  authority text not null,
  published text not null,
  last_verified text not null,
  confidence text not null,
  notes text
);

create table operator_claims (
  id text primary key,
  leg text not null,
  source_class text not null default 'operator_reported',
  claim text not null,
  entities jsonb not null default '{}'::jsonb,
  date_observed text not null,
  last_verified text not null,
  first_person boolean not null,
  hearsay boolean not null,
  confidence text not null,
  status text not null,
  superseded_by text,
  conflicts_with text[],
  n_reports int not null default 1,
  verbatim_quote text,
  notes text
);

-- ---------------------------------------------------------------------------
-- Capture trail (docs/adr/0001) — append-only record of how intelligence
-- entered the system. Never rendered by any UI; no request metadata (no IPs,
-- no user agents) is ever stored. raw_text/ask rows are subject to the
-- 30-day retention window below.

create table debriefs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_text text,              -- nulled by retention; the row and its links survive
  extracted jsonb not null    -- ExtractedClaim[] as produced by the extractor
);

-- target_id is deliberately NOT a foreign key: replace_claims rewrites
-- operator_claims wholesale, and the trail must keep recording history for
-- claims that were superseded away.
create table merge_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  debrief_id uuid references debriefs(id),
  action text not null,       -- created | corroborated | superseded | conflict
  target_id text,
  extracted jsonb not null
);

-- Ask questions can contain forward-looking convoy detail, so whole rows are
-- deleted by retention — `gap` analysis must be done within the window.
create table ask_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  question text not null,
  answer text,
  gap boolean not null default false,  -- true = "no verified intel" (a Gap Signal)
  citations text[]
);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default. The service role bypasses RLS; nobody else gets in.
alter table corridor enable row level security;
alter table official_rules enable row level security;
alter table operator_claims enable row level security;
alter table debriefs enable row level security;
alter table merge_events enable row level security;
alter table ask_logs enable row level security;

-- ---------------------------------------------------------------------------
-- RPCs. The merge engine stays in the app (pure TypeScript); these functions
-- only give it atomic load and guarded write.

create or replace function insert_claims_internal(new_claims jsonb)
returns void
language sql
as $$
  insert into operator_claims (
    id, leg, source_class, claim, entities, date_observed, last_verified,
    first_person, hearsay, confidence, status, superseded_by, conflicts_with,
    n_reports, verbatim_quote, notes
  )
  select
    r.id, r.leg, r.source_class, r.claim,
    coalesce(r.entities, '{}'::jsonb),
    r.date_observed, r.last_verified, r.first_person, r.hearsay,
    r.confidence, r.status, r.superseded_by,
    case
      when r.conflicts_with is null then null
      else array(select jsonb_array_elements_text(r.conflicts_with))
    end,
    r.n_reports, r.verbatim_quote, r.notes
  from jsonb_to_recordset(new_claims) as r(
    id text, leg text, source_class text, claim text, entities jsonb,
    date_observed text, last_verified text, first_person boolean,
    hearsay boolean, confidence text, status text, superseded_by text,
    conflicts_with jsonb, n_reports int, verbatim_quote text, notes text
  );
$$;

create or replace function get_corridor_state()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'version', (select version from corridor where id = 'gb-ua-pl'),
    'claims', coalesce(
      (select jsonb_agg(to_jsonb(c) order by c.id) from operator_claims c),
      '[]'::jsonb
    ),
    'rules', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.id) from official_rules r),
      '[]'::jsonb
    )
  );
$$;

-- Atomic claims replacement under optimistic versioning. Raises 40001
-- (serialization_failure) on a stale expected_version; the app reloads,
-- re-runs the pure merge, and retries.
create or replace function replace_claims(expected_version bigint, new_claims jsonb)
returns bigint
language plpgsql
as $$
declare
  current_version bigint;
begin
  select version into current_version
  from corridor where id = 'gb-ua-pl'
  for update;

  if current_version is distinct from expected_version then
    raise exception 'version_conflict: expected %, found %',
      expected_version, current_version
      using errcode = '40001';
  end if;

  delete from operator_claims;
  perform insert_claims_internal(new_claims);

  update corridor set version = version + 1 where id = 'gb-ua-pl';
  return current_version + 1;
end;
$$;

-- Reseed claims and rules from the app's seed JSON (data/seed-data.json stays
-- the single source of truth — no seed copy lives in SQL). The capture trail
-- is deliberately untouched: it is the append-only record of what actually
-- happened, resets included.
create or replace function reset_corridor(seed_claims jsonb, seed_rules jsonb)
returns void
language plpgsql
as $$
begin
  perform version from corridor where id = 'gb-ua-pl' for update;

  delete from operator_claims;
  perform insert_claims_internal(seed_claims);

  delete from official_rules;
  insert into official_rules (
    id, leg, source_class, claim, authority, published, last_verified,
    confidence, notes
  )
  select r.id, r.leg, r.source_class, r.claim, r.authority, r.published,
         r.last_verified, r.confidence, r.notes
  from jsonb_to_recordset(seed_rules) as r(
    id text, leg text, source_class text, claim text, authority text,
    published text, last_verified text, confidence text, notes text
  );

  update corridor set version = version + 1 where id = 'gb-ua-pl';
end;
$$;

-- Only the service role may execute the RPCs (PostgREST would otherwise
-- expose them to anon).
revoke execute on function insert_claims_internal(jsonb) from public, anon, authenticated;
revoke execute on function get_corridor_state() from public, anon, authenticated;
revoke execute on function replace_claims(bigint, jsonb) from public, anon, authenticated;
revoke execute on function reset_corridor(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention (docs/adr/0001): raw operator/asker text lives 30 days.
-- Structured claims and the shape of the trail persist; verbatim speech
-- does not.
create extension if not exists pg_cron;

create or replace function apply_retention()
returns void
language sql
as $$
  update debriefs
  set raw_text = null
  where created_at < now() - interval '30 days' and raw_text is not null;

  delete from ask_logs
  where created_at < now() - interval '30 days';
$$;

revoke execute on function apply_retention() from public, anon, authenticated;

select cron.schedule('aidroute-retention', '30 3 * * *', 'select apply_retention()');
