-- Keep profile creation in the Auth transaction so email-confirmation settings
-- do not affect whether the signup account name is persisted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, account_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'account_name'), '')
  );

  return new;
end;
$$;

-- Backfill only unambiguous metadata names. If the same normalized metadata
-- name belongs to multiple Auth users, or is already used by another profile,
-- leave those profiles unchanged instead of risking a unique violation.
do $$
declare
  backfilled_count bigint;
  duplicate_metadata_user_count bigint;
  existing_profile_conflict_count bigint;
begin
  with normalized_metadata as materialized (
    select
      users.id,
      nullif(btrim(users.raw_user_meta_data ->> 'account_name'), '') as account_name
    from auth.users as users
  ),
  eligible as (
    select metadata.id, metadata.account_name
    from normalized_metadata as metadata
    join public.profiles as profiles
      on profiles.id = metadata.id
    where profiles.account_name is null
      and metadata.account_name is not null
      and (
        select count(*)
        from normalized_metadata as duplicate
        where duplicate.account_name = metadata.account_name
      ) = 1
      and not exists (
        select 1
        from public.profiles as named_profile
        where named_profile.account_name = metadata.account_name
      )
  )
  update public.profiles as profiles
  set account_name = eligible.account_name,
      updated_at = now()
  from eligible
  where profiles.id = eligible.id;

  get diagnostics backfilled_count = row_count;

  with normalized_metadata as (
    select
      users.id,
      nullif(btrim(users.raw_user_meta_data ->> 'account_name'), '') as account_name
    from auth.users as users
  )
  select count(*)
  into duplicate_metadata_user_count
  from normalized_metadata as metadata
  join public.profiles as profiles
    on profiles.id = metadata.id
  where profiles.account_name is null
    and metadata.account_name is not null
    and (
      select count(*)
      from normalized_metadata as duplicate
      where duplicate.account_name = metadata.account_name
    ) > 1;

  with normalized_metadata as (
    select
      users.id,
      nullif(btrim(users.raw_user_meta_data ->> 'account_name'), '') as account_name
    from auth.users as users
  )
  select count(*)
  into existing_profile_conflict_count
  from normalized_metadata as metadata
  join public.profiles as profiles
    on profiles.id = metadata.id
  where profiles.account_name is null
    and metadata.account_name is not null
    and (
      select count(*)
      from normalized_metadata as duplicate
      where duplicate.account_name = metadata.account_name
    ) = 1
    and exists (
      select 1
      from public.profiles as named_profile
      where named_profile.account_name = metadata.account_name
        and named_profile.id <> metadata.id
    );

  raise warning
    'account name backfill audit: backfilled=%, duplicate_metadata_users_skipped=%, existing_profile_conflicts_skipped=%',
    backfilled_count,
    duplicate_metadata_user_count,
    existing_profile_conflict_count;
end;
$$;
