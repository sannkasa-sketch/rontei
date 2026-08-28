-- During create_topic_with_rules, the topic and factions exist briefly before
-- topic_rules is inserted. Treat that internal construction state as open;
-- foreign keys still reject unknown topic ids.
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
  ), false);
$$;
