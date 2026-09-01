-- Expose only a boolean availability result; do not require clients to inspect
-- profile rows in order to validate a signup name.
create or replace function public.is_account_name_available(p_account_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    char_length(btrim(p_account_name)) between 2 and 30
    and not exists (
      select 1
      from public.profiles as profiles
      where profiles.account_name = btrim(p_account_name)
    ),
    false
  );
$$;

revoke execute on function public.is_account_name_available(text) from public;
grant execute on function public.is_account_name_available(text) to anon, authenticated, service_role;

-- Account names are immutable for ordinary clients after signup. Keep the
-- service_role table privileges intact for administrative maintenance.
drop policy if exists "Users can update their own profile" on public.profiles;
revoke update on table public.profiles from anon, authenticated;
revoke update (account_name) on table public.profiles from authenticated;
