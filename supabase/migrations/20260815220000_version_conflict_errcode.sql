-- Raising the stale-version conflict as SQLSTATE 40001 (serialization_failure)
-- made PostgREST treat it as a transient transaction failure: observed
-- behaviour on hosted Supabase is that the request NEVER returns — the
-- deterministic conflict is retried server-side forever, hanging the caller.
-- The optimistic-concurrency retry belongs in the app's runMerge loop, so
-- raise a plain application error (default P0001) instead; the backend
-- detects it by the 'version_conflict' message prefix.

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
      expected_version, current_version;
  end if;

  delete from operator_claims where true;
  perform insert_claims_internal(new_claims);

  update corridor set version = version + 1 where id = 'gb-ua-pl';
  return current_version + 1;
end;
$$;

revoke execute on function replace_claims(bigint, jsonb) from public, anon, authenticated;
