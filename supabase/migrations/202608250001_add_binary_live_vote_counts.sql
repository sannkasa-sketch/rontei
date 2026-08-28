alter table public.topic_rules
  add column show_live_vote_counts boolean not null default false;

create or replace function public.can_view_binary_vote_counts(p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.debate_type = 'binary'
      and (public.is_topic_effectively_ended(t.id) or r.show_live_vote_counts)
    from public.topics t
    join public.topic_rules r on r.topic_id = t.id
    where t.id = p_topic_id
  ), false);
$$;

revoke all on function public.can_view_binary_vote_counts(uuid) from public, anon, authenticated;

create or replace function public.set_binary_live_vote_counts(
  p_topic_id uuid,
  p_show_live_vote_counts boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.topic_creators
    where topic_id = p_topic_id and user_id = auth.uid()
  ) then
    raise exception '作成者だけが設定できます';
  end if;

  if not exists (
    select 1 from public.topics
    where id = p_topic_id and debate_type = 'binary'
  ) then
    raise exception '白黒形式だけで設定できます';
  end if;

  if exists (
    select 1 from public.topic_members where topic_id = p_topic_id
  ) then
    raise exception '参加開始後は途中票数の公開設定を変更できません';
  end if;

  update public.topic_rules
  set show_live_vote_counts = coalesce(p_show_live_vote_counts, false),
      updated_at = now()
  where topic_id = p_topic_id;

  if not found then
    raise exception '討論ルールを確認できません';
  end if;
end;
$$;

revoke all on function public.set_binary_live_vote_counts(uuid, boolean) from public, anon;
grant execute on function public.set_binary_live_vote_counts(uuid, boolean) to authenticated;

create or replace function public.get_binary_final_result(p_topic_id uuid)
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
set search_path = ''
as $$
  with permitted_topic as (
    select p_topic_id as topic_id
    where public.can_view_binary_vote_counts(p_topic_id)
  ), faction_votes as (
    select f.id as faction_id, f.name as faction_name, f.sort_order,
           count(tm.id)::bigint as vote_count
    from permitted_topic permitted
    join public.factions f on f.topic_id = permitted.topic_id
    left join public.topic_members tm
      on tm.topic_id = f.topic_id and tm.primary_faction_id = f.id
    group by f.id, f.name, f.sort_order
  ), totals as (
    select coalesce(sum(vote_count), 0)::bigint as total_votes from faction_votes
  ), missing as (
    select count(*)::bigint as unassigned
    from permitted_topic permitted
    join public.topic_members tm on tm.topic_id = permitted.topic_id
    where tm.primary_faction_id is null
  )
  select fv.faction_id, fv.faction_name, fv.vote_count, totals.total_votes,
         missing.unassigned,
         dense_rank() over (order by fv.vote_count desc)::bigint as result_rank
  from faction_votes fv cross join totals cross join missing
  order by result_rank, fv.sort_order;
$$;

create or replace function public.get_topic_faction_summary(p_topic_id uuid)
returns table (
  faction_id uuid,
  faction_name text,
  primary_member_count bigint,
  post_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id as faction_id,
    f.name as faction_name,
    (
      select count(*) from public.topic_members tm
      where tm.topic_id = p_topic_id and tm.primary_faction_id = f.id
    ) as primary_member_count,
    (
      select count(*) from public.posts p
      where p.topic_id = p_topic_id and p.faction_id = f.id
    ) as post_count
  from public.factions f
  join public.topics t on t.id = f.topic_id
  where f.topic_id = p_topic_id
    and (t.debate_type <> 'binary' or public.can_view_binary_vote_counts(p_topic_id))
  order by f.sort_order, f.name;
$$;
