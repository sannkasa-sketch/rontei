create or replace view public.public_topics_with_end_state
with (security_invoker = true)
as
select
  t.id,
  t.slug,
  t.title,
  t.summary,
  t.debate_type,
  t.category,
  t.status,
  t.created_at,
  t.ends_at,
  t.last_post_at,
  case
    when r.end_mode = 'inactivity' then coalesce(t.last_post_at, t.created_at) + make_interval(mins => r.inactivity_timeout_minutes)
    else t.ends_at
  end as effective_ends_at,
  (
    t.status <> 'active'
    or case
      when r.end_mode = 'inactivity' then coalesce(t.last_post_at, t.created_at) + make_interval(mins => r.inactivity_timeout_minutes) <= now()
      else t.ends_at is not null and t.ends_at <= now()
    end
  ) as effectively_ended
from public.topics t
join public.topic_rules r on r.topic_id = t.id;

grant select on public.public_topics_with_end_state to anon, authenticated;
