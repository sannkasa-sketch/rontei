-- Binary debates now accept two or more initial factions. Existing rows and
-- public interfaces remain compatible.
create or replace function public.ensure_binary_faction_limit()
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
  if v_debate_type = 'binary' then
    select count(*) into v_count from public.factions where topic_id = v_topic_id;
    if v_count < 2 then
      raise exception '白黒形式では派閥を2つ以上設定してください';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_binary_topic_rules()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_debate_type text;
begin
  select debate_type into v_debate_type from public.topics where id = new.topic_id;
  if v_debate_type = 'binary' then
    new.allow_faction_change := true;
    new.allow_multiple_factions := false;
    new.allow_faction_addition := false;
  end if;
  return new;
end;
$$;

alter table public.topic_rules drop constraint if exists topic_rules_inactivity_timeout_valid;
alter table public.topic_rules add constraint topic_rules_inactivity_timeout_valid check (
  (end_mode = 'fixed' and inactivity_timeout_minutes is null)
  or
  (end_mode = 'inactivity' and (
    inactivity_timeout_minutes between 10 and 50
    or (inactivity_timeout_minutes between 60 and 1380 and inactivity_timeout_minutes % 60 = 0)
    or (inactivity_timeout_minutes between 1440 and 10080 and inactivity_timeout_minutes % 1440 = 0)
  ))
);

create or replace function public.validate_topic_end_range()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.ends_at is not null and (new.ends_at <= now() or new.ends_at > now() + interval '14 days') then
    raise exception '終了日時は現在より未来、かつ2週間以内で指定してください';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_topic_end_range on public.topics;
create trigger validate_topic_end_range before insert or update of ends_at on public.topics
for each row execute function public.validate_topic_end_range();

drop function if exists public.get_binary_final_result(uuid);
create function public.get_binary_final_result(p_topic_id uuid)
returns table (
  faction_id uuid,
  faction_name text,
  vote_count bigint,
  total_votes bigint,
  unassigned bigint,
  result_rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with faction_votes as (
    select f.id as faction_id, f.name as faction_name, f.sort_order,
           count(tm.id)::bigint as vote_count
    from public.factions f
    left join public.topic_members tm
      on tm.topic_id = f.topic_id and tm.primary_faction_id = f.id
    where f.topic_id = p_topic_id
    group by f.id, f.name, f.sort_order
  ), totals as (
    select coalesce(sum(vote_count), 0)::bigint as total_votes from faction_votes
  ), missing as (
    select count(*)::bigint as unassigned
    from public.topic_members
    where topic_id = p_topic_id and primary_faction_id is null
  )
  select fv.faction_id, fv.faction_name, fv.vote_count, totals.total_votes,
         missing.unassigned,
         dense_rank() over (order by fv.vote_count desc)::bigint as result_rank
  from faction_votes fv cross join totals cross join missing
  order by result_rank, fv.sort_order;
$$;
grant execute on function public.get_binary_final_result(uuid) to anon, authenticated;

create or replace function public.set_topic_advanced_rules(
  p_topic_id uuid,
  p_end_mode text,
  p_inactivity_timeout_minutes integer,
  p_shuffle_factions boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_debate_type text; v_name_mode text; v_valid_timeout boolean;
begin
  if not exists (select 1 from public.topic_creators where topic_id = p_topic_id and user_id = auth.uid()) then raise exception '作成者だけが設定できます'; end if;
  if p_end_mode not in ('fixed', 'inactivity') then raise exception '終了条件が正しくありません'; end if;
  v_valid_timeout := p_inactivity_timeout_minutes between 10 and 50
    or (p_inactivity_timeout_minutes between 60 and 1380 and p_inactivity_timeout_minutes % 60 = 0)
    or (p_inactivity_timeout_minutes between 1440 and 10080 and p_inactivity_timeout_minutes % 1440 = 0);
  if p_end_mode = 'inactivity' and (p_inactivity_timeout_minutes is null or not v_valid_timeout) then raise exception '最終発言から終了までの時間が範囲外です'; end if;
  select t.debate_type, r.name_mode into v_debate_type, v_name_mode from public.topics t join public.topic_rules r on r.topic_id = t.id where t.id = p_topic_id;
  if p_shuffle_factions and v_name_mode = 'werewolf' then raise exception '人狼記名ではシャッフルを使用できません'; end if;
  update public.topic_rules set
    end_mode = p_end_mode,
    inactivity_timeout_minutes = case when p_end_mode = 'inactivity' then p_inactivity_timeout_minutes else null end,
    shuffle_factions = p_shuffle_factions,
    require_faction = true,
    allow_faction_change = case when p_shuffle_factions then false when v_debate_type = 'binary' then true else allow_faction_change end,
    allow_multiple_factions = case when p_shuffle_factions or v_debate_type = 'binary' then false else allow_multiple_factions end,
    allow_faction_addition = case when p_shuffle_factions or v_debate_type = 'binary' then false else allow_faction_addition end
  where topic_id = p_topic_id;
  if p_end_mode = 'inactivity' then update public.topics set ends_at = null where id = p_topic_id; end if;
end;
$$;
