alter table public.topic_rules
  add column if not exists end_mode text not null default 'fixed'
    check (end_mode in ('fixed', 'inactivity')),
  add column if not exists inactivity_timeout_minutes integer,
  add column if not exists shuffle_factions boolean not null default false;

alter table public.topics
  add column if not exists last_post_at timestamptz;

alter table public.topic_rules
  drop constraint if exists topic_rules_inactivity_timeout_valid;
alter table public.topic_rules
  add constraint topic_rules_inactivity_timeout_valid check (
    (end_mode = 'fixed' and inactivity_timeout_minutes is null)
    or
    (end_mode = 'inactivity' and inactivity_timeout_minutes between 10 and 10080)
  );

create or replace function public.is_topic_effectively_ended(p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select t.status <> 'active'
      or case
        when r.end_mode = 'inactivity' then
          coalesce(t.last_post_at, t.created_at) + make_interval(mins => r.inactivity_timeout_minutes) <= now()
        else t.ends_at is not null and t.ends_at <= now()
      end
    from public.topics t
    join public.topic_rules r on r.topic_id = t.id
    where t.id = p_topic_id
  ), true);
$$;

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
declare
  v_debate_type text;
  v_name_mode text;
begin
  if not exists (select 1 from public.topic_creators where topic_id = p_topic_id and user_id = auth.uid()) then
    raise exception '作成者だけが設定できます';
  end if;
  if p_end_mode not in ('fixed', 'inactivity') then raise exception '終了条件が正しくありません'; end if;
  if p_end_mode = 'inactivity' and (p_inactivity_timeout_minutes is null or p_inactivity_timeout_minutes < 10 or p_inactivity_timeout_minutes > 10080) then
    raise exception '無投稿終了時間が範囲外です';
  end if;

  select t.debate_type, r.name_mode into v_debate_type, v_name_mode
  from public.topics t join public.topic_rules r on r.topic_id = t.id where t.id = p_topic_id;
  if p_shuffle_factions and v_name_mode = 'werewolf' then raise exception '人狼記名ではシャッフルを使用できません'; end if;

  update public.topic_rules
  set end_mode = p_end_mode,
      inactivity_timeout_minutes = case when p_end_mode = 'inactivity' then p_inactivity_timeout_minutes else null end,
      shuffle_factions = p_shuffle_factions,
      require_faction = true,
      allow_faction_change = case when p_shuffle_factions then false when v_debate_type = 'binary' then true else allow_faction_change end,
      allow_multiple_factions = case when p_shuffle_factions or v_debate_type = 'binary' then false else allow_multiple_factions end,
      allow_faction_addition = case when p_shuffle_factions then false else allow_faction_addition end
  where topic_id = p_topic_id;

  if p_end_mode = 'inactivity' then update public.topics set ends_at = null where id = p_topic_id; end if;
end;
$$;

create or replace function public.update_topic_last_post_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.topics set last_post_at = new.created_at where id = new.topic_id;
  return new;
end;
$$;
drop trigger if exists update_topic_last_post_at on public.posts;
create trigger update_topic_last_post_at after insert on public.posts
for each row execute function public.update_topic_last_post_at();

create or replace function public.enforce_topic_member_primary_faction()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_debate_type text; v_is_creator boolean; v_shuffle boolean; v_forced_faction_id uuid;
begin
  select t.debate_type, r.shuffle_factions into v_debate_type, v_shuffle
  from public.topics t join public.topic_rules r on r.topic_id = t.id where t.id = new.topic_id;
  if public.is_topic_effectively_ended(new.topic_id) then raise exception 'この討論は終了しています'; end if;
  if v_shuffle then
    select id into v_forced_faction_id from public.factions where topic_id = new.topic_id order by random() limit 1;
    if v_forced_faction_id is null then raise exception '派閥を確認できません'; end if;
    new.primary_faction_id := v_forced_faction_id;
  elsif v_debate_type in ('exploration', 'casual', 'recruitment') then
    select exists (select 1 from public.topic_creators where topic_id = new.topic_id and user_id = new.user_id) into v_is_creator;
    select id into v_forced_faction_id from public.factions where topic_id = new.topic_id and sort_order = case when v_is_creator then 1 else 2 end limit 1;
    if v_forced_faction_id is null then raise exception '固定役割の派閥を確認できません'; end if;
    new.primary_faction_id := v_forced_faction_id;
  elsif new.primary_faction_id is null then raise exception '派閥への所属は必須です';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_single_faction_membership()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_type text; v_shuffle boolean; v_topic_id uuid;
begin
  select topic_id into v_topic_id from public.factions where id = new.faction_id;
  select t.debate_type, r.shuffle_factions into v_type, v_shuffle
  from public.topics t join public.topic_rules r on r.topic_id = t.id where t.id = v_topic_id;
  if v_type = 'binary' or v_shuffle then raise exception 'この討論では複数派閥へ所属できません'; end if;
  return new;
end;
$$;
drop trigger if exists enforce_single_faction_membership on public.topic_member_factions;
create trigger enforce_single_faction_membership before insert on public.topic_member_factions
for each row execute function public.enforce_single_faction_membership();

create or replace function public.reject_activity_after_effective_end()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_topic_id uuid := coalesce(new.topic_id, old.topic_id);
begin
  if public.is_topic_effectively_ended(v_topic_id) then raise exception 'この討論は終了しています'; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists reject_ended_post on public.posts;
create trigger reject_ended_post before insert on public.posts for each row execute function public.reject_activity_after_effective_end();
drop trigger if exists reject_ended_faction on public.factions;
create trigger reject_ended_faction before insert or update on public.factions for each row execute function public.reject_activity_after_effective_end();
drop trigger if exists reject_ended_member_faction on public.topic_member_factions;
-- Membership RPCs are additionally protected by the single-membership trigger;
-- their existing open-topic checks remain in place for legacy schemas.

create or replace function public.enforce_new_topic_rule_semantics()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_debate_type text;
begin
  select debate_type into v_debate_type from public.topics where id = new.topic_id;
  new.require_faction := true;
  if v_debate_type = 'binary' then new.allow_multiple_factions := false; end if;
  if new.shuffle_factions then
    new.allow_faction_change := false; new.allow_multiple_factions := false; new.allow_faction_addition := false;
    if new.name_mode = 'werewolf' then raise exception '人狼記名ではシャッフルを使用できません'; end if;
  elsif v_debate_type in ('exploration', 'casual', 'recruitment') then
    new.allow_faction_change := false; new.allow_multiple_factions := false; new.allow_faction_addition := false;
    if new.name_mode = 'werewolf' then raise exception 'この討論形式では人狼記名を使用できません'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_new_topic_rule_semantics on public.topic_rules;
create trigger enforce_new_topic_rule_semantics before insert or update on public.topic_rules
for each row execute function public.enforce_new_topic_rule_semantics();
