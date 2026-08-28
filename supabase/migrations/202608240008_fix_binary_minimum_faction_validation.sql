-- A row-level faction trigger cannot validate a minimum while the initial
-- faction rows are still being inserted. Validate the minimum when the topic
-- rules are finalized instead, while keeping faction inserts unlimited.
create or replace function public.ensure_binary_faction_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_binary_topic_rules()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debate_type text;
  v_faction_count integer;
begin
  select debate_type into v_debate_type from public.topics where id = new.topic_id;
  if v_debate_type = 'binary' then
    select count(*) into v_faction_count from public.factions where topic_id = new.topic_id;
    if v_faction_count < 2 then
      raise exception '白黒形式では派閥を2つ以上設定してください';
    end if;
    new.allow_faction_change := true;
    new.allow_multiple_factions := false;
    new.allow_faction_addition := false;
  end if;
  return new;
end;
$$;
