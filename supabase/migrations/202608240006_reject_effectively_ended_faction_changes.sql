create or replace function public.reject_member_faction_change_after_end()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_topic_effectively_ended(new.topic_id) then raise exception 'この討論は終了しています'; end if;
  return new;
end;
$$;
drop trigger if exists reject_ended_primary_faction_change on public.topic_members;
create trigger reject_ended_primary_faction_change
before update of primary_faction_id on public.topic_members
for each row when (old.primary_faction_id is distinct from new.primary_faction_id)
execute function public.reject_member_faction_change_after_end();

create or replace function public.reject_affiliation_change_after_end()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_faction_id uuid := coalesce(new.faction_id, old.faction_id); v_topic_id uuid;
begin
  select topic_id into v_topic_id from public.factions where id = v_faction_id;
  if public.is_topic_effectively_ended(v_topic_id) then raise exception 'この討論は終了しています'; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists reject_ended_affiliation_change on public.topic_member_factions;
create trigger reject_ended_affiliation_change
before insert or update or delete on public.topic_member_factions
for each row execute function public.reject_affiliation_change_after_end();
