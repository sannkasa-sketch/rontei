-- New topics always require a faction. Exploration, casual and recruitment use
-- two fixed roles. Existing rows are intentionally left untouched.
create or replace function public.enforce_new_topic_rule_semantics()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debate_type text;
begin
  select debate_type into v_debate_type from public.topics where id = new.topic_id;
  new.require_faction := true;
  if v_debate_type in ('exploration', 'casual', 'recruitment') then
    new.allow_faction_change := false;
    new.allow_multiple_factions := false;
    new.allow_faction_addition := false;
    if new.name_mode = 'werewolf' then
      raise exception 'この討論形式では人狼記名を使用できません';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_new_topic_rule_semantics on public.topic_rules;
create trigger enforce_new_topic_rule_semantics
before insert on public.topic_rules
for each row execute function public.enforce_new_topic_rule_semantics();

create or replace function public.enforce_fixed_role_faction_count()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_topic_id uuid := coalesce(new.topic_id, old.topic_id);
  v_debate_type text;
  v_count integer;
begin
  select debate_type into v_debate_type from public.topics where id = v_topic_id;
  if v_debate_type in ('exploration', 'casual', 'recruitment') then
    select count(*) into v_count from public.factions where topic_id = v_topic_id;
    if v_count <> 2 then
      raise exception 'この討論形式では派閥を2つ設定してください';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists enforce_fixed_role_faction_count on public.factions;
create constraint trigger enforce_fixed_role_faction_count
after insert or update or delete on public.factions
deferrable initially deferred
for each row execute function public.enforce_fixed_role_faction_count();

create or replace function public.enforce_topic_member_primary_faction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debate_type text;
  v_is_creator boolean;
  v_forced_faction_id uuid;
begin
  select debate_type into v_debate_type from public.topics where id = new.topic_id;

  if v_debate_type in ('exploration', 'casual', 'recruitment') then
    select exists (
      select 1 from public.topic_creators
      where topic_id = new.topic_id and user_id = new.user_id
    ) into v_is_creator;

    select id into v_forced_faction_id
    from public.factions
    where topic_id = new.topic_id
      and sort_order = case when v_is_creator then 1 else 2 end
    limit 1;

    if v_forced_faction_id is null then
      raise exception '固定役割の派閥を確認できません';
    end if;
    new.primary_faction_id := v_forced_faction_id;
  elsif new.primary_faction_id is null then
    raise exception '派閥への所属は必須です';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_topic_member_primary_faction on public.topic_members;
create trigger enforce_topic_member_primary_faction
before insert on public.topic_members
for each row execute function public.enforce_topic_member_primary_faction();
