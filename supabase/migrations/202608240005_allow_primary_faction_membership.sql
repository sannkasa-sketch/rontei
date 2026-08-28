create or replace function public.enforce_single_faction_membership()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_type text; v_shuffle boolean; v_topic_id uuid;
begin
  select topic_id into v_topic_id from public.factions where id = new.faction_id;
  select t.debate_type, r.shuffle_factions into v_type, v_shuffle
  from public.topics t join public.topic_rules r on r.topic_id = t.id where t.id = v_topic_id;

  if (v_type = 'binary' or v_shuffle)
     and exists (
       select 1 from public.topic_member_factions existing
       where existing.topic_member_id = new.topic_member_id
     ) then
    raise exception 'この討論では複数派閥へ所属できません';
  end if;
  return new;
end;
$$;
