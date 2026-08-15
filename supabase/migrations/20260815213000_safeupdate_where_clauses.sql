-- Hosted Supabase runs pg-safeupdate, which rejects DELETE without a WHERE
-- clause — including inside these functions. The bare DELETEs in the initial
-- migration made reset_corridor (and, latently, replace_claims — the live
-- merge path) fail with "DELETE requires a WHERE clause". Re-create both
-- with tautological `where true` quals; behaviour is otherwise identical.
-- CREATE OR REPLACE preserves the existing execute revocations.

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

  delete from operator_claims where true;
  perform insert_claims_internal(new_claims);

  update corridor set version = version + 1 where id = 'gb-ua-pl';
  return current_version + 1;
end;
$$;

create or replace function reset_corridor(seed_claims jsonb, seed_rules jsonb)
returns void
language plpgsql
as $$
begin
  perform version from corridor where id = 'gb-ua-pl' for update;

  delete from operator_claims where true;
  perform insert_claims_internal(seed_claims);

  delete from official_rules where true;
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

-- Belt and braces: re-assert the execute restrictions.
revoke execute on function replace_claims(bigint, jsonb) from public, anon, authenticated;
revoke execute on function reset_corridor(jsonb, jsonb) from public, anon, authenticated;
