begin;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%relation_type%'
  loop
    execute format('alter table public.posts drop constraint %I', constraint_record.conname);
  end loop;
end
$$;

alter table public.posts
  add constraint posts_relation_type_check
  check (relation_type in ('main', 'agree', 'oppose', 'supplement', 'question'));

alter table public.posts
  add constraint posts_relation_parent_check
  check (
    (relation_type = 'main' and parent_post_id is null)
    or
    (relation_type in ('agree', 'oppose', 'supplement', 'question') and parent_post_id is not null)
  );

comment on constraint posts_relation_type_check on public.posts is
  'Allowed post relations. question is a reply-only relation.';

-- Preserve the existing security-sensitive implementation. The wrapper delegates
-- all validation and snapshot work, then relabels the newly-created reply only.
alter function public.create_post(uuid, text, uuid, text, uuid)
  rename to create_post_without_question_20260823;

revoke all on function public.create_post_without_question_20260823(uuid, text, uuid, text, uuid)
  from public, anon, authenticated;

create function public.create_post(
  p_topic_id uuid,
  p_content text,
  p_parent_post_id uuid,
  p_relation_type text,
  p_faction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_post_id uuid;
begin
  if p_relation_type = 'question' then
    if p_parent_post_id is null then
      raise exception '質問には返信先が必要です';
    end if;

    created_post_id := public.create_post_without_question_20260823(
      p_topic_id, p_content, p_parent_post_id, 'supplement', p_faction_id
    );

    update public.posts set relation_type = 'question' where id = created_post_id;
    if not found then raise exception '質問投稿を作成できませんでした'; end if;
    return created_post_id;
  end if;

  return public.create_post_without_question_20260823(
    p_topic_id, p_content, p_parent_post_id, p_relation_type, p_faction_id
  );
end;
$$;

revoke all on function public.create_post(uuid, text, uuid, text, uuid) from public;
grant execute on function public.create_post(uuid, text, uuid, text, uuid) to authenticated;

commit;
