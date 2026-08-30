-- Restore automatic profile creation for newly registered Auth users.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Repair users created while the trigger was absent. The existing trigger
-- function inserts only the user id, so the backfill intentionally does the
-- same and leaves all profile defaults to public.profiles.
insert into public.profiles (id)
select users.id
from auth.users as users
left join public.profiles as profiles
  on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

-- Abort rather than silently completing if any Auth user is still missing a
-- profile. Counts contain no credentials and are useful in migration output.
do $$
declare
  auth_user_count bigint;
  profile_count bigint;
  missing_profile_count bigint;
begin
  select count(*) into auth_user_count from auth.users;
  select count(*) into profile_count from public.profiles;
  select count(*)
    into missing_profile_count
  from auth.users as users
  left join public.profiles as profiles
    on profiles.id = users.id
  where profiles.id is null;

  raise notice 'profile trigger audit: auth_users=%, profiles=%, missing_profiles=%',
    auth_user_count, profile_count, missing_profile_count;

  if missing_profile_count <> 0 then
    raise exception 'profile backfill incomplete: % Auth users remain without profiles',
      missing_profile_count;
  end if;
end;
$$;
