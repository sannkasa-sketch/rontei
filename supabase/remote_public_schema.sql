


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_member_id uuid;

  v_allow_multiple boolean;
  v_status text;
  v_ends_at timestamptz;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  select
    t.status,
    t.ends_at,
    coalesce(r.allow_multiple_factions, false)
  into
    v_status,
    v_ends_at,
    v_allow_multiple
  from public.topics t
  left join public.topic_rules r
    on r.topic_id = t.id
  where t.id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  if v_status <> 'active'
     or (
       v_ends_at is not null
       and v_ends_at <= now()
     ) then
    raise exception '終了した討論では所属派閥を変更できません';
  end if;


  if not v_allow_multiple then
    raise exception 'この討論では複数派閥への所属は許可されていません';
  end if;


  select tm.id
  into v_member_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id
  for update;

  if v_member_id is null then
    raise exception 'この討論に参加していません';
  end if;


  -- 同じ議題の派閥か確認
  perform 1
  from public.factions f
  where f.id = p_faction_id
    and f.topic_id = p_topic_id;

  if not found then
    raise exception '不正な派閥です';
  end if;


  -- 既に所属済み
  perform 1
  from public.topic_member_factions tmf
  where tmf.topic_member_id = v_member_id
    and tmf.faction_id = p_faction_id;

  if found then
    raise exception 'この派閥には既に所属しています';
  end if;


  insert into public.topic_member_factions (
    topic_member_id,
    faction_id
  )
  values (
    v_member_id,
    p_faction_id
  );

end;
$$;


ALTER FUNCTION "public"."add_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_topic_faction"("p_topic_id" "uuid", "p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_allow_addition boolean;
  v_status text;
  v_ends_at timestamptz;

  v_sort_order integer;
  v_faction_id uuid;
  v_name text;
begin

  -- ログイン確認
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- 派閥名
  v_name := btrim(p_name);

  if v_name is null
     or char_length(v_name) < 1
     or char_length(v_name) > 30 then
    raise exception '派閥名は1～30文字で入力してください';
  end if;


  -- 議題状態とルール
  select
    t.status,
    t.ends_at,
    coalesce(r.allow_faction_addition, false)
  into
    v_status,
    v_ends_at,
    v_allow_addition
  from public.topics t
  left join public.topic_rules r
    on r.topic_id = t.id
  where t.id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  -- 終了済み
  if v_status <> 'active'
     or (
       v_ends_at is not null
       and v_ends_at <= now()
     ) then
    raise exception '終了した討論では派閥を追加できません';
  end if;


  -- 追加ルール
  if not v_allow_addition then
    raise exception 'この討論では派閥の追加は許可されていません';
  end if;


  -- この討論への参加確認
  select tm.id
  into v_member_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id;

  if v_member_id is null then
    raise exception '派閥を追加するには討論への参加が必要です';
  end if;


  -- 重複確認
  perform 1
  from public.factions f
  where f.topic_id = p_topic_id
    and lower(f.name) = lower(v_name);

  if found then
    raise exception '同じ名前の派閥が既に存在します';
  end if;


  -- 一番後ろへ追加
  select coalesce(max(f.sort_order), 0) + 1
  into v_sort_order
  from public.factions f
  where f.topic_id = p_topic_id;


  insert into public.factions (
    topic_id,
    name,
    sort_order
  )
  values (
    p_topic_id,
    v_name,
    v_sort_order
  )
  returning id into v_faction_id;


  return v_faction_id;


exception
  when unique_violation then
    raise exception '同じ名前の派閥が既に存在します';

end;
$$;


ALTER FUNCTION "public"."add_topic_faction"("p_topic_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_topic_faction"("p_topic_id" "uuid", "p_new_faction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;

  v_member_id uuid;
  v_old_faction_id uuid;

  v_allow_change boolean;

  v_status text;
  v_ends_at timestamptz;
begin

  -- ログイン確認
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- 議題状態と移動ルールを取得
  select
    t.status,
    t.ends_at,
    coalesce(r.allow_faction_change, false)
  into
    v_status,
    v_ends_at,
    v_allow_change
  from public.topics t
  left join public.topic_rules r
    on r.topic_id = t.id
  where t.id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  -- 終了後は移動不可
  if v_status <> 'active'
     or (
       v_ends_at is not null
       and v_ends_at <= now()
     ) then
    raise exception '終了した討論では派閥を移動できません';
  end if;


  -- 議題ルール確認
  if not v_allow_change then
    raise exception 'この討論では派閥の移動は許可されていません';
  end if;


  -- 本人の参加情報
  select
    tm.id,
    tm.primary_faction_id
  into
    v_member_id,
    v_old_faction_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id
  for update;

  if v_member_id is null then
    raise exception 'この討論に参加していません';
  end if;


  -- 移動先確認
  perform 1
  from public.factions f
  where f.id = p_new_faction_id
    and f.topic_id = p_topic_id;

  if not found then
    raise exception '不正な移動先派閥です';
  end if;


  -- 同じ派閥には移動しない
  if v_old_faction_id = p_new_faction_id then
    raise exception '現在と同じ派閥です';
  end if;


  -- 履歴保存
  insert into public.topic_member_faction_history (
    topic_member_id,
    from_faction_id,
    to_faction_id
  )
  values (
    v_member_id,
    v_old_faction_id,
    p_new_faction_id
  );


  -- 現在派閥を更新
  update public.topic_members
  set
    previous_faction_id = v_old_faction_id,
    primary_faction_id = p_new_faction_id,
    updated_at = now()
  where id = v_member_id;

end;
$$;


ALTER FUNCTION "public"."change_topic_faction"("p_topic_id" "uuid", "p_new_faction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.create_post(
    p_topic_id,
    p_content,
    p_parent_post_id,
    p_relation_type,
    null::uuid
  );
$$;


ALTER FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_post_without_question_20260823"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;

  v_member_id uuid;
  v_speaker_name text;

  v_primary_faction_id uuid;
  v_previous_faction_id uuid;

  v_post_faction_id uuid;
  v_post_previous_faction_id uuid;

  v_name_mode text;
  v_account_name text;
  v_display_name text;

  v_allow_multiple boolean := false;

  v_max_posts integer;
  v_current_posts integer;

  v_min_points integer;
  v_current_points integer;

  v_post_id uuid;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  if char_length(btrim(p_content)) < 1 then
    raise exception '投稿内容を入力してください';
  end if;

  if char_length(p_content) > 5000 then
    raise exception '投稿は5000文字以内で入力してください';
  end if;


  if p_relation_type not in (
    'main',
    'agree',
    'oppose',
    'supplement'
  ) then
    raise exception '不正な投稿タイプです';
  end if;


  perform 1
  from public.topics
  where id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  select
    r.name_mode,
    r.max_posts_per_member,
    r.min_evaluation_points,
    coalesce(r.allow_multiple_factions, false)
  into
    v_name_mode,
    v_max_posts,
    v_min_points,
    v_allow_multiple
  from public.topic_rules r
  where r.topic_id = p_topic_id;

  v_name_mode := coalesce(v_name_mode, 'topic_alias');
  v_allow_multiple := coalesce(v_allow_multiple, false);


  select
    tm.id,
    tm.speaker_name,
    tm.primary_faction_id,
    tm.previous_faction_id
  into
    v_member_id,
    v_speaker_name,
    v_primary_faction_id,
    v_previous_faction_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id
  for update;

  if v_member_id is null then
    raise exception 'この討論に参加していません';
  end if;


  -- =====================================================
  -- 投稿派閥を決定
  -- =====================================================

  v_post_faction_id :=
    coalesce(p_faction_id, v_primary_faction_id);


  if v_post_faction_id is not null then

    perform 1
    from public.factions f
    where f.id = v_post_faction_id
      and f.topic_id = p_topic_id;

    if not found then
      raise exception '不正な派閥です';
    end if;

  end if;


  -- =====================================================
  -- 人狼
  -- =====================================================

  if v_name_mode = 'werewolf' then

    if p_faction_id is null then
      raise exception '発言する派閥を選択してください';
    end if;


    -- 選択した派閥に対応する人狼名を取得
    select wa.speaker_name
    into v_display_name
    from public.topic_member_werewolf_aliases wa
    where wa.topic_member_id = v_member_id
      and wa.topic_id = p_topic_id
      and wa.faction_id = v_post_faction_id;


    if v_display_name is null then
      raise exception 'この派閥の発言名が設定されていません';
    end if;


    -- 人狼では派閥移動という概念を使用しない
    v_post_previous_faction_id := null;


  -- =====================================================
  -- 通常の複数派閥
  -- =====================================================

  elsif v_allow_multiple then

    if v_post_faction_id is not null then

      perform 1
      from public.topic_member_factions tmf
      where tmf.topic_member_id = v_member_id
        and tmf.faction_id = v_post_faction_id;

      if not found then
        raise exception '所属していない派閥では発言できません';
      end if;

    end if;


    if v_post_faction_id is not distinct from v_primary_faction_id then
      v_post_previous_faction_id := v_previous_faction_id;
    else
      v_post_previous_faction_id := null;
    end if;


  -- =====================================================
  -- 通常の単一派閥
  -- =====================================================

  else

    if v_post_faction_id is distinct from v_primary_faction_id then
      raise exception 'この討論では所属派閥以外から発言できません';
    end if;

    v_post_previous_faction_id := v_previous_faction_id;

  end if;


  -- =====================================================
  -- 評価ポイント
  -- =====================================================

  if v_min_points is not null then

    select coalesce(p.evaluation_points, 0)
    into v_current_points
    from public.profiles p
    where p.id = v_user_id;

    v_current_points := coalesce(v_current_points, 0);

    if v_current_points < v_min_points then
      raise exception
        'この討論で発言するには評価ポイント%pt以上が必要です（現在%pt）',
        v_min_points,
        v_current_points;
    end if;

  end if;


  -- =====================================================
  -- 発言回数
  -- =====================================================

  if v_max_posts is not null then

    select count(*)
    into v_current_posts
    from public.post_authors pa
    join public.posts p
      on p.id = pa.post_id
    where pa.topic_member_id = v_member_id
      and p.topic_id = p_topic_id;

    if v_current_posts >= v_max_posts then
      raise exception
        'この討論での発言回数上限（%回）に達しています',
        v_max_posts;
    end if;

  end if;


  -- =====================================================
  -- 通常記名モードの表示名
  -- 人狼は上ですでに決定済み
  -- =====================================================

  if v_name_mode <> 'werewolf' then

    case v_name_mode

      when 'anonymous' then
        v_display_name := '匿名';

      when 'topic_alias' then

        if v_speaker_name is null
           or char_length(btrim(v_speaker_name)) < 2 then
          raise exception '発言名が設定されていません';
        end if;

        v_display_name := btrim(v_speaker_name);

      when 'account' then

        select p.account_name
        into v_account_name
        from public.profiles p
        where p.id = v_user_id;

        if v_account_name is null
           or char_length(btrim(v_account_name)) < 2 then
          raise exception 'アカウント名が設定されていません';
        end if;

        v_display_name := btrim(v_account_name);

      else
        raise exception '不正な記名ルールです';

    end case;

  end if;


  -- =====================================================
  -- 本筋 / 返信
  -- =====================================================

  if p_relation_type = 'main' then

    if p_parent_post_id is not null then
      raise exception '本筋投稿に親投稿は指定できません';
    end if;

  else

    if p_parent_post_id is null then
      raise exception '返信先の投稿が必要です';
    end if;

    perform 1
    from public.posts
    where id = p_parent_post_id
      and topic_id = p_topic_id;

    if not found then
      raise exception '返信先の投稿が存在しません';
    end if;

  end if;


  insert into public.posts (
    topic_id,
    faction_id,
    previous_faction_id,
    parent_post_id,
    relation_type,
    author_name,
    content
  )
  values (
    p_topic_id,
    v_post_faction_id,
    v_post_previous_faction_id,
    p_parent_post_id,
    p_relation_type,
    v_display_name,
    btrim(p_content)
  )
  returning id into v_post_id;


  insert into public.post_authors (
    post_id,
    topic_member_id
  )
  values (
    v_post_id,
    v_member_id
  );


  return v_post_id;

end;
$$;


ALTER FUNCTION "public"."create_post_without_question_20260823"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_topic"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_topic_id uuid;
  v_slug text;
  v_faction text;
  v_order integer := 1;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  if char_length(btrim(p_title)) < 2 then
    raise exception 'タイトルは2文字以上で入力してください';
  end if;

  if char_length(btrim(p_content)) < 1 then
    raise exception '内容を入力してください';
  end if;

  if p_debate_type not in (
    'superiority',
    'binary',
    'exploration',
    'casual',
    'recruitment'
  ) then
    raise exception '不正な討論タイプです';
  end if;

  if p_factions is null or array_length(p_factions, 1) < 1 then
    raise exception '派閥を1つ以上設定してください';
  end if;

  -- URL用slug
  -- UUIDを含めるので重複しにくい
  v_slug :=
    'topic-' ||
    replace(gen_random_uuid()::text, '-', '');

  insert into public.topics (
    slug,
    title,
    summary,
    content,
    purpose,
    debate_type,
    status,
    ends_at
  )
  values (
    v_slug,
    btrim(p_title),
    nullif(btrim(p_summary), ''),
    btrim(p_content),
    nullif(btrim(p_purpose), ''),
    p_debate_type,
    'active',
    p_ends_at
  )
  returning id into v_topic_id;

  insert into public.topic_creators (
    topic_id,
    user_id
  )
  values (
    v_topic_id,
    v_user_id
  );

  foreach v_faction in array p_factions
  loop
    if char_length(btrim(v_faction)) > 0 then
      insert into public.factions (
        topic_id,
        name,
        sort_order
      )
      values (
        v_topic_id,
        btrim(v_faction),
        v_order
      );

      v_order := v_order + 1;
    end if;
  end loop;

  return v_topic_id;
end;
$$;


ALTER FUNCTION "public"."create_topic"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_topic_with_rules"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[], "p_name_mode" "text", "p_max_posts_per_member" integer, "p_require_faction" boolean, "p_allow_faction_change" boolean, "p_allow_multiple_factions" boolean, "p_allow_faction_addition" boolean, "p_allow_deception" boolean, "p_min_evaluation_points" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_topic_id uuid;
  v_slug text;

  v_faction text;
  v_order integer := 1;

  v_clean_factions text[];
  v_faction_count integer;
  v_distinct_faction_count integer;
begin

  -- =========================================
  -- ログイン確認
  -- =========================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- =========================================
  -- 基本情報
  -- =========================================

  if char_length(btrim(p_title)) < 2 then
    raise exception 'タイトルは2文字以上で入力してください';
  end if;

  if char_length(btrim(p_content)) < 1 then
    raise exception '内容を入力してください';
  end if;


  -- =========================================
  -- 討論タイプ
  -- =========================================

  if p_debate_type not in (
    'superiority',
    'binary',
    'exploration',
    'casual',
    'recruitment'
  ) then
    raise exception '不正な討論タイプです';
  end if;


  -- =========================================
  -- 記名ルール
  -- =========================================

  if p_name_mode not in (
    'anonymous',
    'topic_alias',
    'account',
    'werewolf'
  ) then
    raise exception '不正な記名ルールです';
  end if;


  -- =========================================
  -- 回数制限
  -- =========================================

  if p_max_posts_per_member is not null
     and p_max_posts_per_member < 1 then
    raise exception '発言回数は1以上で設定してください';
  end if;


  -- =========================================
  -- 評価ポイント制限
  -- =========================================

  if p_min_evaluation_points is not null
     and p_min_evaluation_points < 0 then
    raise exception '必要評価ポイントは0以上で設定してください';
  end if;


  -- =========================================
  -- 派閥名を整理
  -- 空欄を除外
  -- =========================================

  select coalesce(
    array_agg(clean_name),
    array[]::text[]
  )
  into v_clean_factions
  from (
    select btrim(x) as clean_name
    from unnest(
      coalesce(p_factions, array[]::text[])
    ) as u(x)
    where btrim(x) <> ''
  ) s;


  v_faction_count :=
    cardinality(v_clean_factions);


  select count(distinct x)
  into v_distinct_faction_count
  from unnest(v_clean_factions) as u(x);


  if v_faction_count <> v_distinct_faction_count then
    raise exception '同じ派閥名を複数設定することはできません';
  end if;


  if coalesce(p_require_faction, true)
     and v_faction_count < 1 then
    raise exception '派閥を1つ以上設定してください';
  end if;


  -- =========================================
  -- slug作成
  -- =========================================

  v_slug :=
    'topic-' ||
    replace(gen_random_uuid()::text, '-', '');


  -- =========================================
  -- topics作成
  -- =========================================

  insert into public.topics (
    slug,
    title,
    summary,
    content,
    purpose,
    debate_type,
    status,
    ends_at
  )
  values (
    v_slug,
    btrim(p_title),
    nullif(btrim(p_summary), ''),
    btrim(p_content),
    nullif(btrim(p_purpose), ''),
    p_debate_type,
    'active',
    p_ends_at
  )
  returning id into v_topic_id;


  -- =========================================
  -- 作成者を非公開テーブルへ保存
  -- =========================================

  insert into public.topic_creators (
    topic_id,
    user_id
  )
  values (
    v_topic_id,
    v_user_id
  );


  -- =========================================
  -- 派閥作成
  -- =========================================

  foreach v_faction in array v_clean_factions
  loop

    insert into public.factions (
      topic_id,
      name,
      sort_order
    )
    values (
      v_topic_id,
      v_faction,
      v_order
    );

    v_order := v_order + 1;

  end loop;


  -- =========================================
  -- 討論ルール作成
  -- =========================================

  insert into public.topic_rules (
    topic_id,
    name_mode,
    max_posts_per_member,
    require_faction,
    allow_faction_change,
    allow_multiple_factions,
    allow_faction_addition,
    allow_deception,
    min_evaluation_points
  )
  values (
    v_topic_id,
    p_name_mode,
    p_max_posts_per_member,
    coalesce(p_require_faction, true),
    coalesce(p_allow_faction_change, false),
    coalesce(p_allow_multiple_factions, false),
    coalesce(p_allow_faction_addition, false),
    coalesce(p_allow_deception, false),
    p_min_evaluation_points
  );


  return v_topic_id;

end;
$$;


ALTER FUNCTION "public"."create_topic_with_rules"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[], "p_name_mode" "text", "p_max_posts_per_member" integer, "p_require_faction" boolean, "p_allow_faction_change" boolean, "p_allow_multiple_factions" boolean, "p_allow_faction_addition" boolean, "p_allow_deception" boolean, "p_min_evaluation_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_fixed_role_faction_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_fixed_role_faction_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_new_topic_rule_semantics"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_new_topic_rule_semantics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_faction_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_single_faction_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_topic_member_primary_faction"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_topic_member_primary_faction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_binary_faction_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."ensure_binary_faction_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_binary_topic_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."ensure_binary_topic_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_debate_type_post_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_debate_type text;
begin

  select t.debate_type
  into v_debate_type
  from public.topics t
  where t.id = new.topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  -- 「募集」は枝投稿禁止
  if v_debate_type = 'recruitment'
     and (
       new.relation_type <> 'main'
       or new.parent_post_id is not null
     ) then

    raise exception '募集形式の討論では返信できません';

  end if;


  return new;

end;
$$;


ALTER FUNCTION "public"."ensure_debate_type_post_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_reaction_allowed_by_topic_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_allow_deception boolean := false;
begin

  select coalesce(tr.allow_deception, false)
  into v_allow_deception
  from public.posts p
  left join public.topic_rules tr
    on tr.topic_id = p.topic_id
  where p.id = new.post_id;

  if not found then
    raise exception '投稿が存在しません';
  end if;


  -- 虚偽を許可する討論では「懐疑」を使用不可
  if v_allow_deception
     and new.reaction_type = 'skeptical' then

    raise exception
      '虚偽が許可された討論では「懐疑」は使用できません';

  end if;


  return new;

end;
$$;


ALTER FUNCTION "public"."ensure_reaction_allowed_by_topic_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_superiority_topic_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_debate_type text;
  v_faction_count integer;
begin

  select t.debate_type
  into v_debate_type
  from public.topics t
  where t.id = new.topic_id;


  if v_debate_type = 'superiority' then

    select count(*)
    into v_faction_count
    from public.factions f
    where f.topic_id = new.topic_id;

    if v_faction_count < 2 then
      raise exception
        '優劣形式では派閥を2つ以上設定してください';
    end if;

  end if;


  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_superiority_topic_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_topic_open_for_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status text;
  v_ends_at timestamptz;
begin

  select
    t.status,
    t.ends_at
  into
    v_status,
    v_ends_at
  from public.topics t
  where t.id = new.topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  -- 明示的に終了済みの場合
  if v_status <> 'active' then
    raise exception 'この討論は終了しています';
  end if;


  -- 終了日時を過ぎている場合
  if v_ends_at is not null
     and v_ends_at <= now() then
    raise exception 'この討論は終了しています';
  end if;


  return new;

end;
$$;


ALTER FUNCTION "public"."ensure_topic_open_for_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_werewolf_faction_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_name_mode text;
  v_faction_count integer;
begin

  select tr.name_mode
  into v_name_mode
  from public.topic_rules tr
  where tr.topic_id = new.topic_id;


  if v_name_mode = 'werewolf' then

    select count(*)
    into v_faction_count
    from public.factions f
    where f.topic_id = new.topic_id;

    if v_faction_count > 2 then
      raise exception
        '人狼記名では派閥は2つまでです';
    end if;

  end if;


  return new;

end;
$$;


ALTER FUNCTION "public"."ensure_werewolf_faction_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_werewolf_topic_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_faction_count integer;
begin

  if new.name_mode = 'werewolf' then

    select count(*)
    into v_faction_count
    from public.factions f
    where f.topic_id = new.topic_id;


    if v_faction_count <> 2 then
      raise exception
        '人狼記名では派閥を2つにしてください';
    end if;


    -- 人狼では2つの人格を派閥ごとに使うため、
    -- 通常の派閥関連ルールとは併用しない
    if new.allow_faction_addition then
      raise exception
        '人狼記名では派閥追加を使用できません';
    end if;

    if new.allow_multiple_factions then
      raise exception
        '人狼記名では複数派閥ルールを使用できません';
    end if;

    if new.allow_faction_change then
      raise exception
        '人狼記名では派閥移動を使用できません';
    end if;

  end if;


  return new;

end;
$$;


ALTER FUNCTION "public"."ensure_werewolf_topic_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_binary_final_result"("p_topic_id" "uuid") RETURNS TABLE("faction_id" "uuid", "faction_name" "text", "vote_count" bigint, "total_votes" bigint, "unassigned" bigint, "result_rank" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_binary_final_result"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_faction_change_events"("p_topic_id" "uuid") RETURNS TABLE("from_faction_name" "text", "to_faction_name" "text", "display_name" "text", "moved_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    ff.name as from_faction_name,
    tf.name as to_faction_name,

    case coalesce(tr.name_mode, 'topic_alias')

      when 'anonymous' then
        '匿名参加者'

      when 'topic_alias' then
        coalesce(tm.speaker_name, '参加者')

      when 'account' then
        coalesce(p.account_name, '参加者')

      when 'werewolf' then
        '参加者'

      else
        '参加者'

    end as display_name,

    h.moved_at

  from public.topic_member_faction_history h

  join public.topic_members tm
    on tm.id = h.topic_member_id

  left join public.factions ff
    on ff.id = h.from_faction_id

  join public.factions tf
    on tf.id = h.to_faction_id

  join public.topics t
    on t.id = tm.topic_id

  left join public.topic_rules tr
    on tr.topic_id = t.id

  left join public.profiles p
    on p.id = tm.user_id

  where tm.topic_id = p_topic_id

  order by h.moved_at desc;
$$;


ALTER FUNCTION "public"."get_faction_change_events"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_evaluation_requirement"("p_topic_id" "uuid") RETURNS TABLE("current_points" integer, "required_points" integer, "is_limited" boolean, "meets_requirement" boolean, "points_needed" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_current_points integer := 0;
  v_required_points integer;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- 議題が存在するか確認
  perform 1
  from public.topics
  where id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  -- 自分の現在ポイント
  select coalesce(p.evaluation_points, 0)
  into v_current_points
  from public.profiles p
  where p.id = v_user_id;

  v_current_points := coalesce(v_current_points, 0);


  -- この議題の必要ポイント
  select r.min_evaluation_points
  into v_required_points
  from public.topic_rules r
  where r.topic_id = p_topic_id;


  return query
  select
    v_current_points,
    v_required_points,

    (v_required_points is not null),

    (
      v_required_points is null
      or v_current_points >= v_required_points
    ),

    case
      when v_required_points is null then 0
      else greatest(
        v_required_points - v_current_points,
        0
      )
    end;

end;
$$;


ALTER FUNCTION "public"."get_my_evaluation_requirement"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_post_reactions"("p_topic_id" "uuid") RETURNS TABLE("post_id" "uuid", "reaction_type" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    r.post_id,
    r.reaction_type
  from public.post_reactions r
  join public.posts p
    on p.id = r.post_id
  where p.topic_id = p_topic_id
    and r.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_post_reactions"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_post_usage"("p_topic_id" "uuid") RETURNS TABLE("used_posts" bigint, "max_posts" integer, "remaining_posts" bigint, "is_limited" boolean, "limit_reached" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_max_posts integer;
  v_used_posts bigint := 0;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- 議題の発言上限を取得
  select r.max_posts_per_member
  into v_max_posts
  from public.topic_rules r
  where r.topic_id = p_topic_id;


  -- 現在ログイン中の本人の参加情報だけ取得
  select tm.id
  into v_member_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id;


  -- 参加済みなら本人の投稿数を集計
  if v_member_id is not null then

    select count(*)
    into v_used_posts
    from public.post_authors pa
    join public.posts p
      on p.id = pa.post_id
    where pa.topic_member_id = v_member_id
      and p.topic_id = p_topic_id;

  end if;


  return query
  select
    v_used_posts,
    v_max_posts,

    case
      when v_max_posts is null then null
      else greatest(
        v_max_posts::bigint - v_used_posts,
        0::bigint
      )
    end,

    (v_max_posts is not null),

    (
      v_max_posts is not null
      and v_used_posts >= v_max_posts
    );

end;
$$;


ALTER FUNCTION "public"."get_my_post_usage"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_topic_factions"("p_topic_id" "uuid") RETURNS TABLE("faction_id" "uuid", "faction_name" "text", "is_primary" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    f.id as faction_id,
    f.name as faction_name,
    (f.id = tm.primary_faction_id) as is_primary

  from public.topic_members tm

  join public.topic_member_factions tmf
    on tmf.topic_member_id = tm.id

  join public.factions f
    on f.id = tmf.faction_id

  where tm.topic_id = p_topic_id
    and tm.user_id = auth.uid()

  order by
    (f.id = tm.primary_faction_id) desc,
    f.sort_order,
    f.name;
$$;


ALTER FUNCTION "public"."get_my_topic_factions"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_werewolf_aliases"("p_topic_id" "uuid") RETURNS TABLE("faction_id" "uuid", "faction_name" "text", "speaker_name" "text", "is_primary" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    f.id,
    f.name,
    wa.speaker_name,
    (f.id = tm.primary_faction_id)

  from public.topic_members tm

  join public.topic_member_werewolf_aliases wa
    on wa.topic_member_id = tm.id
   and wa.topic_id = tm.topic_id

  join public.factions f
    on f.id = wa.faction_id
   and f.topic_id = tm.topic_id

  where tm.topic_id = p_topic_id
    and tm.user_id = auth.uid()

  order by
    f.sort_order,
    f.name;
$$;


ALTER FUNCTION "public"."get_my_werewolf_aliases"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_post_reaction_counts"("p_topic_id" "uuid") RETURNS TABLE("post_id" "uuid", "agree_count" bigint, "dissatisfied_count" bigint, "skeptical_count" bigint, "uncertain_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    p.id,

    count(*) filter (
      where r.reaction_type = 'agree'
    ) as agree_count,

    count(*) filter (
      where r.reaction_type = 'dissatisfied'
    ) as dissatisfied_count,

    count(*) filter (
      where r.reaction_type = 'skeptical'
    ) as skeptical_count,

    count(*) filter (
      where r.reaction_type = 'uncertain'
    ) as uncertain_count

  from public.posts p

  left join public.post_reactions r
    on r.post_id = p.id

  where p.topic_id = p_topic_id

  group by p.id;
$$;


ALTER FUNCTION "public"."get_post_reaction_counts"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_superiority_final_result"("p_topic_id" "uuid") RETURNS TABLE("faction_id" "uuid", "faction_name" "text", "points" bigint, "post_count" bigint, "result_rank" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_debate_type text;
  v_status text;
  v_ends_at timestamptz;
begin

  select
    t.debate_type,
    t.status,
    t.ends_at

  into
    v_debate_type,
    v_status,
    v_ends_at

  from public.topics t
  where t.id = p_topic_id;


  if not found then
    raise exception '議題が存在しません';
  end if;


  if v_debate_type <> 'superiority' then
    raise exception 'この討論は優劣形式ではありません';
  end if;


  -- 終了前は公式最終結果を公開しない
  if v_status = 'active'
     and (
       v_ends_at is null
       or v_ends_at > now()
     ) then

    raise exception '最終結果は討論終了後に公開されます';

  end if;


  return query

  with scores as (
    select
      f.id as faction_id,
      f.name as faction_name,

      coalesce(s.points, 0)::bigint as points,

      (
        select count(*)::bigint
        from public.posts p
        where p.topic_id = p_topic_id
          and p.faction_id = f.id
      ) as post_count

    from public.factions f

    left join public.topic_faction_scores s
      on s.topic_id = f.topic_id
     and s.faction_id = f.id

    where f.topic_id = p_topic_id
  )

  select
    s.faction_id,
    s.faction_name,
    s.points,
    s.post_count,

    dense_rank() over (
      order by s.points desc
    )::integer as result_rank

  from scores s

  order by
    s.points desc,
    s.faction_name;

end;
$$;


ALTER FUNCTION "public"."get_superiority_final_result"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topic_faction_summary"("p_topic_id" "uuid") RETURNS TABLE("faction_id" "uuid", "faction_name" "text", "primary_member_count" bigint, "post_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    f.id as faction_id,
    f.name as faction_name,

    (
      select count(*)
      from public.topic_members tm
      where tm.topic_id = p_topic_id
        and tm.primary_faction_id = f.id
    ) as primary_member_count,

    (
      select count(*)
      from public.posts p
      where p.topic_id = p_topic_id
        and p.faction_id = f.id
    ) as post_count

  from public.factions f

  where f.topic_id = p_topic_id

  order by
    f.sort_order,
    f.name;
$$;


ALTER FUNCTION "public"."get_topic_faction_summary"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topic_public_stats"("p_topic_id" "uuid") RETURNS TABLE("participant_count" bigint, "total_posts" bigint, "main_posts" bigint, "reply_posts" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select

    (
      select count(*)::bigint
      from public.topic_members tm
      where tm.topic_id = p_topic_id
    ) as participant_count,

    (
      select count(*)::bigint
      from public.posts p
      where p.topic_id = p_topic_id
    ) as total_posts,

    (
      select count(*)::bigint
      from public.posts p
      where p.topic_id = p_topic_id
        and p.relation_type = 'main'
    ) as main_posts,

    (
      select count(*)::bigint
      from public.posts p
      where p.topic_id = p_topic_id
        and p.relation_type <> 'main'
    ) as reply_posts;
$$;


ALTER FUNCTION "public"."get_topic_public_stats"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topic_recent_activity"("p_topic_id" "uuid") RETURNS TABLE("posts_last_24h" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    count(*)::bigint as posts_last_24h
  from public.posts p
  where p.topic_id = p_topic_id
    and p.created_at >= now() - interval '24 hours';
$$;


ALTER FUNCTION "public"."get_topic_recent_activity"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topic_record_summary"("p_topic_id" "uuid") RETURNS TABLE("participant_count" bigint, "total_posts" bigint, "main_posts" bigint, "reply_posts" bigint, "faction_change_count" bigint, "reaction_agree_count" bigint, "reaction_dissatisfied_count" bigint, "reaction_skeptical_count" bigint, "reaction_uncertain_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select

    (
      select count(*)
      from public.topic_members tm
      where tm.topic_id = p_topic_id
    ) as participant_count,

    (
      select count(*)
      from public.posts p
      where p.topic_id = p_topic_id
    ) as total_posts,

    (
      select count(*)
      from public.posts p
      where p.topic_id = p_topic_id
        and p.relation_type = 'main'
    ) as main_posts,

    (
      select count(*)
      from public.posts p
      where p.topic_id = p_topic_id
        and p.relation_type <> 'main'
    ) as reply_posts,

    (
      select count(*)
      from public.topic_member_faction_history h
      join public.topic_members tm
        on tm.id = h.topic_member_id
      where tm.topic_id = p_topic_id
    ) as faction_change_count,

    (
      select count(*)
      from public.post_reactions pr
      join public.posts p
        on p.id = pr.post_id
      where p.topic_id = p_topic_id
        and pr.reaction_type = 'agree'
    ) as reaction_agree_count,

    (
      select count(*)
      from public.post_reactions pr
      join public.posts p
        on p.id = pr.post_id
      where p.topic_id = p_topic_id
        and pr.reaction_type = 'dissatisfied'
    ) as reaction_dissatisfied_count,

    (
      select count(*)
      from public.post_reactions pr
      join public.posts p
        on p.id = pr.post_id
      where p.topic_id = p_topic_id
        and pr.reaction_type = 'skeptical'
    ) as reaction_skeptical_count,

    (
      select count(*)
      from public.post_reactions pr
      join public.posts p
        on p.id = pr.post_id
      where p.topic_id = p_topic_id
        and pr.reaction_type = 'uncertain'
    ) as reaction_uncertain_count;
$$;


ALTER FUNCTION "public"."get_topic_record_summary"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topics_public_stats"("p_topic_ids" "uuid"[]) RETURNS TABLE("topic_id" "uuid", "participant_count" bigint, "total_posts" bigint, "main_posts" bigint, "reply_posts" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    t.id as topic_id,

    (
      select count(*)::bigint
      from public.topic_members tm
      where tm.topic_id = t.id
    ) as participant_count,

    (
      select count(*)::bigint
      from public.posts p
      where p.topic_id = t.id
    ) as total_posts,

    (
      select count(*)::bigint
      from public.posts p
      where p.topic_id = t.id
        and p.relation_type = 'main'
    ) as main_posts,

    (
      select count(*)::bigint
      from public.posts p
      where p.topic_id = t.id
        and p.relation_type <> 'main'
    ) as reply_posts

  from public.topics t

  where t.id = any(p_topic_ids);
$$;


ALTER FUNCTION "public"."get_topics_public_stats"("p_topic_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topics_recent_activity"("p_topic_ids" "uuid"[]) RETURNS TABLE("topic_id" "uuid", "posts_last_24h" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    t.id as topic_id,

    count(p.id) filter (
      where p.created_at >= now() - interval '24 hours'
    )::bigint as posts_last_24h

  from public.topics t

  left join public.posts p
    on p.topic_id = t.id

  where t.id = any(p_topic_ids)

  group by t.id;
$$;


ALTER FUNCTION "public"."get_topics_recent_activity"("p_topic_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_werewolf_reveal_pairs"("p_topic_id" "uuid") RETURNS TABLE("alias_1" "text", "faction_1_name" "text", "alias_2" "text", "faction_2_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_name_mode text;
  v_reveal_mode text;
  v_status text;
  v_ends_at timestamptz;
begin

  select
    tr.name_mode,
    tr.werewolf_reveal_mode,
    t.status,
    t.ends_at
  into
    v_name_mode,
    v_reveal_mode,
    v_status,
    v_ends_at
  from public.topics t
  join public.topic_rules tr
    on tr.topic_id = t.id
  where t.id = p_topic_id;


  if not found then
    raise exception '議題が存在しません';
  end if;


  if v_name_mode <> 'werewolf' then
    raise exception 'この討論は人狼記名ではありません';
  end if;


  if v_reveal_mode <> 'after_end' then
    raise exception 'この討論では正体は公開されません';
  end if;


  -- statusが終了扱い、または終了日時を過ぎていれば公開
  if v_status = 'active'
     and (
       v_ends_at is null
       or v_ends_at > now()
     ) then
    raise exception '正体は討論終了後に公開されます';
  end if;


  return query

  with ranked as (
    select
      wa.topic_member_id,
      wa.speaker_name,
      f.name as faction_name,

      row_number() over (
        partition by wa.topic_member_id
        order by
          f.sort_order,
          f.name,
          wa.created_at
      ) as rn

    from public.topic_member_werewolf_aliases wa

    join public.factions f
      on f.id = wa.faction_id

    where wa.topic_id = p_topic_id
      and f.topic_id = p_topic_id
  )

  select
    max(r.speaker_name)
      filter (where r.rn = 1) as alias_1,

    max(r.faction_name)
      filter (where r.rn = 1) as faction_1_name,

    max(r.speaker_name)
      filter (where r.rn = 2) as alias_2,

    max(r.faction_name)
      filter (where r.rn = 2) as faction_2_name

  from ranked r

  group by r.topic_member_id

  having count(*) = 2;

end;
$$;


ALTER FUNCTION "public"."get_werewolf_reveal_pairs"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_reaction_points"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_old_author uuid;
  v_new_author uuid;
begin

  -- DELETE または UPDATE の旧投稿者
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then

    select tm.user_id
    into v_old_author
    from public.post_authors pa
    join public.topic_members tm
      on tm.id = pa.topic_member_id
    where pa.post_id = old.post_id;

  end if;


  -- INSERT または UPDATE の新投稿者
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then

    select tm.user_id
    into v_new_author
    from public.post_authors pa
    join public.topic_members tm
      on tm.id = pa.topic_member_id
    where pa.post_id = new.post_id;

  end if;


  -- 投稿者のポイントを再計算
  if v_old_author is not null then
    perform public.recalculate_evaluation_points(v_old_author);
  end if;


  if v_new_author is not null
     and v_new_author is distinct from v_old_author then
    perform public.recalculate_evaluation_points(v_new_author);
  end if;


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


ALTER FUNCTION "public"."handle_reaction_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_topic_effectively_ended"("p_topic_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."is_topic_effectively_ended"("p_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_topic"("p_topic_id" "uuid", "p_speaker_name" "text", "p_faction_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_member_id uuid;

  v_name_mode text;
  v_require_faction boolean;
  v_min_points integer;

  v_current_points integer;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- 議題とルールを確認
  select
    coalesce(r.name_mode, 'topic_alias'),
    coalesce(r.require_faction, true),
    r.min_evaluation_points
  into
    v_name_mode,
    v_require_faction,
    v_min_points
  from public.topics t
  left join public.topic_rules r
    on r.topic_id = t.id
  where t.id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  -- 既に参加済みか
  select tm.id
  into v_member_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id;

  if v_member_id is not null then
    raise exception 'この討論には既に参加しています';
  end if;


  -- 評価ポイント確認
  select coalesce(p.evaluation_points, 0)
  into v_current_points
  from public.profiles p
  where p.id = v_user_id;

  if v_min_points is not null
     and v_current_points < v_min_points then
    raise exception
      'この討論への参加には評価ポイント%pt以上が必要です（現在%pt）',
      v_min_points,
      v_current_points;
  end if;


  -- 人狼はまだ未実装
  if v_name_mode = 'werewolf' then
    raise exception '人狼記名ルールは現在開発中です';
  end if;


  -- 議題毎名の場合だけ発言名必須
  if v_name_mode = 'topic_alias' then

    if p_speaker_name is null
       or char_length(btrim(p_speaker_name)) < 2
       or char_length(btrim(p_speaker_name)) > 30 then
      raise exception '発言名は2～30文字で入力してください';
    end if;

  end if;


  -- 派閥必須
  if v_require_faction and p_faction_id is null then
    raise exception '派閥を選択してください';
  end if;


  -- 指定された派閥がこの議題のものか確認
  if p_faction_id is not null then

    perform 1
    from public.factions f
    where f.id = p_faction_id
      and f.topic_id = p_topic_id;

    if not found then
      raise exception '不正な派閥です';
    end if;

  end if;


  insert into public.topic_members (
    topic_id,
    user_id,
    speaker_name,
    primary_faction_id
  )
  values (
    p_topic_id,
    v_user_id,

    case
      when v_name_mode = 'topic_alias'
        then btrim(p_speaker_name)
      else null
    end,

    p_faction_id
  )
  returning id into v_member_id;


  return v_member_id;

end;
$$;


ALTER FUNCTION "public"."join_topic"("p_topic_id" "uuid", "p_speaker_name" "text", "p_faction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_werewolf_topic"("p_topic_id" "uuid", "p_primary_faction_id" "uuid", "p_faction_1_id" "uuid", "p_faction_1_name" "text", "p_faction_2_id" "uuid", "p_faction_2_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_member_id uuid;

  v_status text;
  v_ends_at timestamptz;
  v_name_mode text;

  v_min_points integer;
  v_current_points integer := 0;

  v_faction_count integer;

  v_name_1 text;
  v_name_2 text;
begin

  -- ログイン
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  -- 議題とルール
  select
    t.status,
    t.ends_at,
    tr.name_mode,
    tr.min_evaluation_points
  into
    v_status,
    v_ends_at,
    v_name_mode,
    v_min_points
  from public.topics t
  join public.topic_rules tr
    on tr.topic_id = t.id
  where t.id = p_topic_id;


  if not found then
    raise exception '議題が存在しません';
  end if;


  if v_name_mode <> 'werewolf' then
    raise exception 'この討論は人狼記名ではありません';
  end if;


  -- 終了確認
  if v_status <> 'active'
     or (
       v_ends_at is not null
       and v_ends_at <= now()
     ) then

    raise exception 'この討論は終了しています';

  end if;


  -- 2派閥であること
  select count(*)
  into v_faction_count
  from public.factions f
  where f.topic_id = p_topic_id;


  if v_faction_count <> 2 then
    raise exception
      '人狼記名では派閥が2つ必要です';
  end if;


  -- 2つの派閥IDは別々
  if p_faction_1_id = p_faction_2_id then
    raise exception
      '2つの異なる派閥を指定してください';
  end if;


  -- 渡された2派閥が、この議題の2派閥そのものか確認
  select count(*)
  into v_faction_count
  from public.factions f
  where f.topic_id = p_topic_id
    and f.id in (
      p_faction_1_id,
      p_faction_2_id
    );


  if v_faction_count <> 2 then
    raise exception '不正な派閥です';
  end if;


  -- primaryもどちらか
  if p_primary_faction_id not in (
    p_faction_1_id,
    p_faction_2_id
  ) then
    raise exception '初期派閥が不正です';
  end if;


  -- 既に参加していないか
  perform 1
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id;

  if found then
    raise exception 'この討論には既に参加しています';
  end if;


  -- 評価ポイント条件
  if v_min_points is not null then

    select coalesce(p.evaluation_points, 0)
    into v_current_points
    from public.profiles p
    where p.id = v_user_id;

    v_current_points := coalesce(v_current_points, 0);

    if v_current_points < v_min_points then
      raise exception
        'この討論への参加には評価ポイント%pt以上が必要です（現在%pt）',
        v_min_points,
        v_current_points;
    end if;

  end if;


  -- 発言名整形
  v_name_1 := btrim(p_faction_1_name);
  v_name_2 := btrim(p_faction_2_name);


  if v_name_1 is null
     or char_length(v_name_1) < 2
     or char_length(v_name_1) > 30 then
    raise exception
      '発言名は2～30文字で入力してください';
  end if;


  if v_name_2 is null
     or char_length(v_name_2) < 2
     or char_length(v_name_2) > 30 then
    raise exception
      '発言名は2～30文字で入力してください';
  end if;


  if lower(v_name_1) = lower(v_name_2) then
    raise exception
      '2つの発言名は別の名前にしてください';
  end if;


  -- topic_membersには共通の発言名を保存しない
  insert into public.topic_members (
    topic_id,
    user_id,
    speaker_name,
    primary_faction_id
  )
  values (
    p_topic_id,
    v_user_id,
    null,
    p_primary_faction_id
  )
  returning id into v_member_id;


  -- 派閥1用人格
  insert into public.topic_member_werewolf_aliases (
    topic_id,
    topic_member_id,
    faction_id,
    speaker_name
  )
  values (
    p_topic_id,
    v_member_id,
    p_faction_1_id,
    v_name_1
  );


  -- 派閥2用人格
  insert into public.topic_member_werewolf_aliases (
    topic_id,
    topic_member_id,
    faction_id,
    speaker_name
  )
  values (
    p_topic_id,
    v_member_id,
    p_faction_2_id,
    v_name_2
  );


  return v_member_id;


exception

  when unique_violation then
    raise exception
      'その発言名はこの討論ですでに使用されています';

end;
$$;


ALTER FUNCTION "public"."join_werewolf_topic"("p_topic_id" "uuid", "p_primary_faction_id" "uuid", "p_faction_1_id" "uuid", "p_faction_1_name" "text", "p_faction_2_id" "uuid", "p_faction_2_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_evaluation_points"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_points integer;
begin

  select coalesce(
    sum(
      case r.reaction_type
        when 'agree' then 2
        when 'skeptical' then -1
        when 'dissatisfied' then 0
        when 'uncertain' then 0
        else 0
      end
    ),
    0
  )
  into v_points

  from public.post_reactions r

  join public.post_authors pa
    on pa.post_id = r.post_id

  join public.topic_members tm
    on tm.id = pa.topic_member_id

  where tm.user_id = p_user_id;


  update public.profiles
  set evaluation_points = greatest(0, v_points)
  where id = p_user_id;

end;
$$;


ALTER FUNCTION "public"."recalculate_evaluation_points"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_activity_after_effective_end"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare v_topic_id uuid := coalesce(new.topic_id, old.topic_id);
begin
  if public.is_topic_effectively_ended(v_topic_id) then raise exception 'この討論は終了しています'; end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."reject_activity_after_effective_end"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_affiliation_change_after_end"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare v_faction_id uuid := coalesce(new.faction_id, old.faction_id); v_topic_id uuid;
begin
  select topic_id into v_topic_id from public.factions where id = v_faction_id;
  if public.is_topic_effectively_ended(v_topic_id) then raise exception 'この討論は終了しています'; end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."reject_affiliation_change_after_end"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_member_faction_change_after_end"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_topic_effectively_ended(new.topic_id) then raise exception 'この討論は終了しています'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."reject_member_faction_change_after_end"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_primary_faction_id uuid;

  v_allow_multiple boolean;
  v_status text;
  v_ends_at timestamptz;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  select
    t.status,
    t.ends_at,
    coalesce(r.allow_multiple_factions, false)
  into
    v_status,
    v_ends_at,
    v_allow_multiple
  from public.topics t
  left join public.topic_rules r
    on r.topic_id = t.id
  where t.id = p_topic_id;

  if not found then
    raise exception '議題が存在しません';
  end if;


  if v_status <> 'active'
     or (
       v_ends_at is not null
       and v_ends_at <= now()
     ) then
    raise exception '終了した討論では所属派閥を変更できません';
  end if;


  if not v_allow_multiple then
    raise exception 'この討論では複数派閥への所属は許可されていません';
  end if;


  select
    tm.id,
    tm.primary_faction_id
  into
    v_member_id,
    v_primary_faction_id
  from public.topic_members tm
  where tm.topic_id = p_topic_id
    and tm.user_id = v_user_id
  for update;

  if v_member_id is null then
    raise exception 'この討論に参加していません';
  end if;


  -- メイン派閥は解除不可
  if v_primary_faction_id = p_faction_id then
    raise exception 'メイン派閥は所属解除できません';
  end if;


  delete from public.topic_member_factions
  where topic_member_id = v_member_id
    and faction_id = p_faction_id;

  if not found then
    raise exception 'この派閥には所属していません';
  end if;

end;
$$;


ALTER FUNCTION "public"."remove_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_post_reaction"("p_post_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  delete from public.post_reactions
  where post_id = p_post_id
    and user_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."remove_post_reaction"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_post_reaction"("p_post_id" "uuid", "p_reaction_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  if p_reaction_type not in (
    'agree',
    'dissatisfied',
    'skeptical',
    'uncertain'
  ) then
    raise exception '不正な評価です';
  end if;

  perform 1
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception '投稿が存在しません';
  end if;


  -- 自分自身の投稿への評価は禁止
  perform 1
  from public.post_authors pa
  join public.topic_members tm
    on tm.id = pa.topic_member_id
  where pa.post_id = p_post_id
    and tm.user_id = v_user_id;

  if found then
    raise exception '自分の投稿は評価できません';
  end if;


  insert into public.post_reactions (
    post_id,
    user_id,
    reaction_type
  )
  values (
    p_post_id,
    v_user_id,
    p_reaction_type
  )
  on conflict (post_id, user_id)
  do update set
    reaction_type = excluded.reaction_type,
    updated_at = now();

end;
$$;


ALTER FUNCTION "public"."set_post_reaction"("p_post_id" "uuid", "p_reaction_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_profile_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_topic_advanced_rules"("p_topic_id" "uuid", "p_end_mode" "text", "p_inactivity_timeout_minutes" integer, "p_shuffle_factions" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_topic_advanced_rules"("p_topic_id" "uuid", "p_end_mode" "text", "p_inactivity_timeout_minutes" integer, "p_shuffle_factions" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_topic_category"("p_topic_id" "uuid", "p_category" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  if p_category not in (
    'politics',
    'society',
    'economy',
    'science',
    'technology',
    'philosophy',
    'culture',
    'entertainment',
    'games',
    'casual',
    'other'
  ) then
    raise exception '不正なカテゴリです';
  end if;


  perform 1
  from public.topic_creators tc
  where tc.topic_id = p_topic_id
    and tc.user_id = v_user_id;

  if not found then
    raise exception 'この議題のカテゴリを変更する権限がありません';
  end if;


  update public.topics
  set category = p_category
  where id = p_topic_id;

end;
$$;


ALTER FUNCTION "public"."set_topic_category"("p_topic_id" "uuid", "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_werewolf_reveal_mode"("p_topic_id" "uuid", "p_reveal_mode" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_name_mode text;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;


  if p_reveal_mode not in (
    'never',
    'after_end'
  ) then
    raise exception '不正な正体公開設定です';
  end if;


  -- 議題作成者本人か
  perform 1
  from public.topic_creators tc
  where tc.topic_id = p_topic_id
    and tc.user_id = v_user_id;

  if not found then
    raise exception 'この設定を変更する権限がありません';
  end if;


  select tr.name_mode
  into v_name_mode
  from public.topic_rules tr
  where tr.topic_id = p_topic_id;

  if not found then
    raise exception '議題ルールが存在しません';
  end if;


  if v_name_mode <> 'werewolf' then
    raise exception 'この討論は人狼記名ではありません';
  end if;


  -- 誰かが参加した後に公開条件を変えるのは禁止
  perform 1
  from public.topic_members tm
  where tm.topic_id = p_topic_id
  limit 1;

  if found then
    raise exception
      '参加者がいるため正体公開設定は変更できません';
  end if;


  update public.topic_rules
  set
    werewolf_reveal_mode = p_reveal_mode,
    updated_at = now()
  where topic_id = p_topic_id;

end;
$$;


ALTER FUNCTION "public"."set_werewolf_reveal_mode"("p_topic_id" "uuid", "p_reveal_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_primary_faction_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_allow_multiple boolean := false;
begin

  select coalesce(r.allow_multiple_factions, false)
  into v_allow_multiple
  from public.topic_rules r
  where r.topic_id = new.topic_id;

  if not found then
    v_allow_multiple := false;
  end if;


  -- 単一派閥モード
  -- 所属一覧も現在のprimaryだけにする
  if not v_allow_multiple then

    delete from public.topic_member_factions
    where topic_member_id = new.id;

    if new.primary_faction_id is not null then
      insert into public.topic_member_factions (
        topic_member_id,
        faction_id
      )
      values (
        new.id,
        new.primary_faction_id
      )
      on conflict do nothing;
    end if;


  -- 複数派閥モード
  -- primary変更前の所属は残し、新primaryも所属に加える
  else

    if new.primary_faction_id is not null then
      insert into public.topic_member_factions (
        topic_member_id,
        faction_id
      )
      values (
        new.id,
        new.primary_faction_id
      )
      on conflict do nothing;
    end if;

  end if;


  return new;
end;
$$;


ALTER FUNCTION "public"."sync_primary_faction_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_superiority_faction_score"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_post_id uuid;
  v_topic_id uuid;
  v_faction_id uuid;

  v_debate_type text;
  v_status text;
  v_ends_at timestamptz;

  v_delta bigint := 0;
begin

  -- ---------------------------------------------
  -- 点数差分
  -- ---------------------------------------------

  if tg_op = 'INSERT' then

    v_post_id := new.post_id;

    v_delta :=
      case new.reaction_type
        when 'agree' then 2
        when 'skeptical' then -1
        else 0
      end;


  elsif tg_op = 'DELETE' then

    v_post_id := old.post_id;

    v_delta := -(
      case old.reaction_type
        when 'agree' then 2
        when 'skeptical' then -1
        else 0
      end
    );


  elsif tg_op = 'UPDATE' then

    -- 通常のリアクション変更ではpost_idは変わらない
    if new.post_id is distinct from old.post_id then
      raise exception 'リアクションの投稿先は変更できません';
    end if;

    v_post_id := new.post_id;

    v_delta :=
      (
        case new.reaction_type
          when 'agree' then 2
          when 'skeptical' then -1
          else 0
        end
      )
      -
      (
        case old.reaction_type
          when 'agree' then 2
          when 'skeptical' then -1
          else 0
        end
      );

  end if;


  -- 点数変化なし
  if v_delta = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- ---------------------------------------------
  -- 投稿の派閥・議題を取得
  -- ---------------------------------------------

  select
    p.topic_id,
    p.faction_id,
    t.debate_type,
    t.status,
    t.ends_at

  into
    v_topic_id,
    v_faction_id,
    v_debate_type,
    v_status,
    v_ends_at

  from public.posts p

  join public.topics t
    on t.id = p.topic_id

  where p.id = v_post_id;


  -- 投稿が存在しない
  if v_topic_id is null then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- 派閥なし投稿は公式ポイント対象外
  if v_faction_id is null then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- 優劣形式だけ対象
  if v_debate_type <> 'superiority' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- ---------------------------------------------
  -- 討論終了後は公式ポイントを変更しない
  -- ---------------------------------------------

  if v_status <> 'active'
     or (
       v_ends_at is not null
       and v_ends_at <= now()
     ) then

    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;

  end if;


  -- ---------------------------------------------
  -- 公式派閥ポイント更新
  -- マイナスも許可
  -- ---------------------------------------------

  insert into public.topic_faction_scores (
    topic_id,
    faction_id,
    points,
    updated_at
  )
  values (
    v_topic_id,
    v_faction_id,
    v_delta,
    now()
  )

  on conflict (topic_id, faction_id)
  do update set
    points = public.topic_faction_scores.points + excluded.points,
    updated_at = now();


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


ALTER FUNCTION "public"."update_superiority_faction_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_topic_last_post_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.topics set last_post_at = new.created_at where id = new.topic_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_topic_last_post_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_topic_end_range"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.ends_at is not null and (new.ends_at <= now() or new.ends_at > now() + interval '14 days') then
    raise exception '終了日時は現在より未来、かつ2週間以内で指定してください';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_topic_end_range"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."factions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."factions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_authors" (
    "post_id" "uuid" NOT NULL,
    "topic_member_id" "uuid" NOT NULL
);


ALTER TABLE "public"."post_authors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "post_reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['agree'::"text", 'dissatisfied'::"text", 'skeptical'::"text", 'uncertain'::"text"])))
);


ALTER TABLE "public"."post_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "faction_id" "uuid",
    "parent_post_id" "uuid",
    "relation_type" "text" DEFAULT 'main'::"text" NOT NULL,
    "author_name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "previous_faction_id" "uuid",
    CONSTRAINT "posts_relation_parent_check" CHECK (((("relation_type" = 'main'::"text") AND ("parent_post_id" IS NULL)) OR (("relation_type" = ANY (ARRAY['agree'::"text", 'oppose'::"text", 'supplement'::"text", 'question'::"text"])) AND ("parent_post_id" IS NOT NULL)))),
    CONSTRAINT "posts_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['main'::"text", 'agree'::"text", 'oppose'::"text", 'supplement'::"text", 'question'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


COMMENT ON CONSTRAINT "posts_relation_type_check" ON "public"."posts" IS 'Allowed post relations. question is a reply-only relation.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "account_name" "text",
    "evaluation_points" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_rules" (
    "topic_id" "uuid" NOT NULL,
    "name_mode" "text" DEFAULT 'topic_alias'::"text" NOT NULL,
    "max_posts_per_member" integer,
    "require_faction" boolean DEFAULT true NOT NULL,
    "allow_faction_change" boolean DEFAULT false NOT NULL,
    "allow_multiple_factions" boolean DEFAULT false NOT NULL,
    "allow_faction_addition" boolean DEFAULT false NOT NULL,
    "allow_deception" boolean DEFAULT false NOT NULL,
    "min_evaluation_points" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "werewolf_reveal_mode" "text" DEFAULT 'never'::"text" NOT NULL,
    "end_mode" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "inactivity_timeout_minutes" integer,
    "shuffle_factions" boolean DEFAULT false NOT NULL,
    CONSTRAINT "topic_rules_end_mode_check" CHECK (("end_mode" = ANY (ARRAY['fixed'::"text", 'inactivity'::"text"]))),
    CONSTRAINT "topic_rules_inactivity_timeout_valid" CHECK (((("end_mode" = 'fixed'::"text") AND ("inactivity_timeout_minutes" IS NULL)) OR (("end_mode" = 'inactivity'::"text") AND ((("inactivity_timeout_minutes" >= 10) AND ("inactivity_timeout_minutes" <= 50)) OR ((("inactivity_timeout_minutes" >= 60) AND ("inactivity_timeout_minutes" <= 1380)) AND (("inactivity_timeout_minutes" % 60) = 0)) OR ((("inactivity_timeout_minutes" >= 1440) AND ("inactivity_timeout_minutes" <= 10080)) AND (("inactivity_timeout_minutes" % 1440) = 0)))))),
    CONSTRAINT "topic_rules_max_posts_per_member_check" CHECK ((("max_posts_per_member" IS NULL) OR ("max_posts_per_member" > 0))),
    CONSTRAINT "topic_rules_min_evaluation_points_check" CHECK ((("min_evaluation_points" IS NULL) OR ("min_evaluation_points" >= 0))),
    CONSTRAINT "topic_rules_name_mode_check" CHECK (("name_mode" = ANY (ARRAY['anonymous'::"text", 'topic_alias'::"text", 'account'::"text", 'werewolf'::"text"]))),
    CONSTRAINT "topic_rules_werewolf_reveal_mode_check" CHECK (("werewolf_reveal_mode" = ANY (ARRAY['never'::"text", 'after_end'::"text"])))
);


ALTER TABLE "public"."topic_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "content" "text" NOT NULL,
    "purpose" "text",
    "debate_type" "text" DEFAULT 'exploration'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "last_post_at" timestamp with time zone,
    CONSTRAINT "topics_category_check" CHECK (("category" = ANY (ARRAY['politics'::"text", 'society'::"text", 'economy'::"text", 'science'::"text", 'technology'::"text", 'philosophy'::"text", 'culture'::"text", 'entertainment'::"text", 'games'::"text", 'casual'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_topics_with_end_state" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."slug",
    "t"."title",
    "t"."summary",
    "t"."debate_type",
    "t"."category",
    "t"."status",
    "t"."created_at",
    "t"."ends_at",
    "t"."last_post_at",
        CASE
            WHEN ("r"."end_mode" = 'inactivity'::"text") THEN (COALESCE("t"."last_post_at", "t"."created_at") + "make_interval"("mins" => "r"."inactivity_timeout_minutes"))
            ELSE "t"."ends_at"
        END AS "effective_ends_at",
    (("t"."status" <> 'active'::"text") OR
        CASE
            WHEN ("r"."end_mode" = 'inactivity'::"text") THEN ((COALESCE("t"."last_post_at", "t"."created_at") + "make_interval"("mins" => "r"."inactivity_timeout_minutes")) <= "now"())
            ELSE (("t"."ends_at" IS NOT NULL) AND ("t"."ends_at" <= "now"()))
        END) AS "effectively_ended"
   FROM ("public"."topics" "t"
     JOIN "public"."topic_rules" "r" ON (("r"."topic_id" = "t"."id")));


ALTER VIEW "public"."public_topics_with_end_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_creators" (
    "topic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."topic_creators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_faction_scores" (
    "topic_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "points" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."topic_faction_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_member_faction_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_member_id" "uuid" NOT NULL,
    "from_faction_id" "uuid",
    "to_faction_id" "uuid" NOT NULL,
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."topic_member_faction_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_member_factions" (
    "topic_member_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."topic_member_factions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_member_werewolf_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "topic_member_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "speaker_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topic_member_werewolf_aliases_speaker_name_check" CHECK ((("char_length"("btrim"("speaker_name")) >= 2) AND ("char_length"("btrim"("speaker_name")) <= 30)))
);


ALTER TABLE "public"."topic_member_werewolf_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "speaker_name" "text",
    "primary_faction_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "previous_faction_id" "uuid"
);


ALTER TABLE "public"."topic_members" OWNER TO "postgres";


ALTER TABLE ONLY "public"."factions"
    ADD CONSTRAINT "factions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."factions"
    ADD CONSTRAINT "factions_topic_id_name_key" UNIQUE ("topic_id", "name");



ALTER TABLE ONLY "public"."post_authors"
    ADD CONSTRAINT "post_authors_pkey" PRIMARY KEY ("post_id");



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_account_name_key" UNIQUE ("account_name");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_creators"
    ADD CONSTRAINT "topic_creators_pkey" PRIMARY KEY ("topic_id");



ALTER TABLE ONLY "public"."topic_faction_scores"
    ADD CONSTRAINT "topic_faction_scores_pkey" PRIMARY KEY ("topic_id", "faction_id");



ALTER TABLE ONLY "public"."topic_member_faction_history"
    ADD CONSTRAINT "topic_member_faction_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_member_factions"
    ADD CONSTRAINT "topic_member_factions_pkey" PRIMARY KEY ("topic_member_id", "faction_id");



ALTER TABLE ONLY "public"."topic_member_werewolf_aliases"
    ADD CONSTRAINT "topic_member_werewolf_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_member_werewolf_aliases"
    ADD CONSTRAINT "topic_member_werewolf_aliases_topic_member_id_faction_id_key" UNIQUE ("topic_member_id", "faction_id");



ALTER TABLE ONLY "public"."topic_members"
    ADD CONSTRAINT "topic_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_members"
    ADD CONSTRAINT "topic_members_topic_id_user_id_key" UNIQUE ("topic_id", "user_id");



ALTER TABLE ONLY "public"."topic_rules"
    ADD CONSTRAINT "topic_rules_pkey" PRIMARY KEY ("topic_id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_slug_key" UNIQUE ("slug");



CREATE UNIQUE INDEX "factions_topic_name_ci_unique" ON "public"."factions" USING "btree" ("topic_id", "lower"("name"));



CREATE INDEX "post_reactions_post_id_idx" ON "public"."post_reactions" USING "btree" ("post_id");



CREATE INDEX "post_reactions_user_id_idx" ON "public"."post_reactions" USING "btree" ("user_id");



CREATE INDEX "posts_faction_id_idx" ON "public"."posts" USING "btree" ("faction_id");



CREATE INDEX "posts_parent_post_id_idx" ON "public"."posts" USING "btree" ("parent_post_id");



CREATE INDEX "posts_topic_id_idx" ON "public"."posts" USING "btree" ("topic_id");



CREATE INDEX "topic_creators_user_id_idx" ON "public"."topic_creators" USING "btree" ("user_id");



CREATE INDEX "topic_member_faction_history_member_idx" ON "public"."topic_member_faction_history" USING "btree" ("topic_member_id");



CREATE INDEX "topic_member_factions_faction_idx" ON "public"."topic_member_factions" USING "btree" ("faction_id");



CREATE UNIQUE INDEX "topic_member_werewolf_aliases_topic_name_ci_unique" ON "public"."topic_member_werewolf_aliases" USING "btree" ("topic_id", "lower"("btrim"("speaker_name")));



CREATE INDEX "topic_members_topic_id_idx" ON "public"."topic_members" USING "btree" ("topic_id");



CREATE UNIQUE INDEX "topic_members_unique_speaker_name" ON "public"."topic_members" USING "btree" ("topic_id", "speaker_name") WHERE ("speaker_name" IS NOT NULL);



CREATE INDEX "topic_members_user_id_idx" ON "public"."topic_members" USING "btree" ("user_id");



CREATE CONSTRAINT TRIGGER "enforce_fixed_role_faction_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."factions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fixed_role_faction_count"();



CREATE OR REPLACE TRIGGER "enforce_new_topic_rule_semantics" BEFORE INSERT OR UPDATE ON "public"."topic_rules" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_new_topic_rule_semantics"();



CREATE OR REPLACE TRIGGER "enforce_single_faction_membership" BEFORE INSERT ON "public"."topic_member_factions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_single_faction_membership"();



CREATE OR REPLACE TRIGGER "enforce_topic_member_primary_faction" BEFORE INSERT ON "public"."topic_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_topic_member_primary_faction"();



CREATE OR REPLACE TRIGGER "ensure_binary_faction_limit" AFTER INSERT ON "public"."factions" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_binary_faction_limit"();



CREATE OR REPLACE TRIGGER "ensure_binary_topic_rules" BEFORE INSERT OR UPDATE ON "public"."topic_rules" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_binary_topic_rules"();



CREATE OR REPLACE TRIGGER "ensure_debate_type_post_rules" BEFORE INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_debate_type_post_rules"();



CREATE OR REPLACE TRIGGER "ensure_reaction_allowed_by_topic_rules" BEFORE INSERT OR UPDATE ON "public"."post_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_reaction_allowed_by_topic_rules"();



CREATE OR REPLACE TRIGGER "ensure_superiority_topic_rules" BEFORE INSERT OR UPDATE ON "public"."topic_rules" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_superiority_topic_rules"();



CREATE OR REPLACE TRIGGER "ensure_topic_open_before_join" BEFORE INSERT ON "public"."topic_members" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_topic_open_for_activity"();



CREATE OR REPLACE TRIGGER "ensure_topic_open_before_post" BEFORE INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_topic_open_for_activity"();



CREATE OR REPLACE TRIGGER "ensure_werewolf_faction_limit" AFTER INSERT ON "public"."factions" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_werewolf_faction_limit"();



CREATE OR REPLACE TRIGGER "ensure_werewolf_topic_rules" BEFORE INSERT OR UPDATE ON "public"."topic_rules" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_werewolf_topic_rules"();



CREATE OR REPLACE TRIGGER "reject_ended_affiliation_change" BEFORE INSERT OR DELETE OR UPDATE ON "public"."topic_member_factions" FOR EACH ROW EXECUTE FUNCTION "public"."reject_affiliation_change_after_end"();



CREATE OR REPLACE TRIGGER "reject_ended_faction" BEFORE INSERT OR UPDATE ON "public"."factions" FOR EACH ROW EXECUTE FUNCTION "public"."reject_activity_after_effective_end"();



CREATE OR REPLACE TRIGGER "reject_ended_post" BEFORE INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."reject_activity_after_effective_end"();



CREATE OR REPLACE TRIGGER "reject_ended_primary_faction_change" BEFORE UPDATE OF "primary_faction_id" ON "public"."topic_members" FOR EACH ROW WHEN (("old"."primary_faction_id" IS DISTINCT FROM "new"."primary_faction_id")) EXECUTE FUNCTION "public"."reject_member_faction_change_after_end"();



CREATE OR REPLACE TRIGGER "set_profile_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_updated_at"();



CREATE OR REPLACE TRIGGER "sync_primary_faction_membership" AFTER INSERT OR UPDATE OF "primary_faction_id" ON "public"."topic_members" FOR EACH ROW EXECUTE FUNCTION "public"."sync_primary_faction_membership"();



CREATE OR REPLACE TRIGGER "update_evaluation_points" AFTER INSERT OR DELETE OR UPDATE ON "public"."post_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_reaction_points"();



CREATE OR REPLACE TRIGGER "update_superiority_faction_score" AFTER INSERT OR DELETE OR UPDATE ON "public"."post_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_superiority_faction_score"();



CREATE OR REPLACE TRIGGER "update_topic_last_post_at" AFTER INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_topic_last_post_at"();



CREATE OR REPLACE TRIGGER "validate_topic_end_range" BEFORE INSERT OR UPDATE OF "ends_at" ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "public"."validate_topic_end_range"();



ALTER TABLE ONLY "public"."factions"
    ADD CONSTRAINT "factions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_authors"
    ADD CONSTRAINT "post_authors_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_authors"
    ADD CONSTRAINT "post_authors_topic_member_id_fkey" FOREIGN KEY ("topic_member_id") REFERENCES "public"."topic_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_parent_post_id_fkey" FOREIGN KEY ("parent_post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_previous_faction_id_fkey" FOREIGN KEY ("previous_faction_id") REFERENCES "public"."factions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_creators"
    ADD CONSTRAINT "topic_creators_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_creators"
    ADD CONSTRAINT "topic_creators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_faction_scores"
    ADD CONSTRAINT "topic_faction_scores_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_faction_scores"
    ADD CONSTRAINT "topic_faction_scores_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_faction_history"
    ADD CONSTRAINT "topic_member_faction_history_from_faction_id_fkey" FOREIGN KEY ("from_faction_id") REFERENCES "public"."factions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."topic_member_faction_history"
    ADD CONSTRAINT "topic_member_faction_history_to_faction_id_fkey" FOREIGN KEY ("to_faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_faction_history"
    ADD CONSTRAINT "topic_member_faction_history_topic_member_id_fkey" FOREIGN KEY ("topic_member_id") REFERENCES "public"."topic_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_factions"
    ADD CONSTRAINT "topic_member_factions_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_factions"
    ADD CONSTRAINT "topic_member_factions_topic_member_id_fkey" FOREIGN KEY ("topic_member_id") REFERENCES "public"."topic_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_werewolf_aliases"
    ADD CONSTRAINT "topic_member_werewolf_aliases_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_werewolf_aliases"
    ADD CONSTRAINT "topic_member_werewolf_aliases_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_member_werewolf_aliases"
    ADD CONSTRAINT "topic_member_werewolf_aliases_topic_member_id_fkey" FOREIGN KEY ("topic_member_id") REFERENCES "public"."topic_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_members"
    ADD CONSTRAINT "topic_members_previous_faction_id_fkey" FOREIGN KEY ("previous_faction_id") REFERENCES "public"."factions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."topic_members"
    ADD CONSTRAINT "topic_members_primary_faction_id_fkey" FOREIGN KEY ("primary_faction_id") REFERENCES "public"."factions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."topic_members"
    ADD CONSTRAINT "topic_members_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_members"
    ADD CONSTRAINT "topic_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_rules"
    ADD CONSTRAINT "topic_rules_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



CREATE POLICY "Factions are publicly readable" ON "public"."factions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Posts are publicly readable" ON "public"."posts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Profiles are publicly readable" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Topic rules are publicly readable" ON "public"."topic_rules" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Topics are publicly readable" ON "public"."topics" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Users can read their own topic memberships" ON "public"."topic_members" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."factions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_authors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_creators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_faction_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_member_faction_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_member_factions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_member_werewolf_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_topic_faction"("p_topic_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_topic_faction"("p_topic_id" "uuid", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_topic_faction"("p_topic_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_topic_faction"("p_topic_id" "uuid", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."change_topic_faction"("p_topic_id" "uuid", "p_new_faction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."change_topic_faction"("p_topic_id" "uuid", "p_new_faction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."change_topic_faction"("p_topic_id" "uuid", "p_new_faction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_topic_faction"("p_topic_id" "uuid", "p_new_faction_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_post"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_post_without_question_20260823"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_post_without_question_20260823"("p_topic_id" "uuid", "p_content" "text", "p_parent_post_id" "uuid", "p_relation_type" "text", "p_faction_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_topic"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_topic"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_topic"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_topic"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_topic_with_rules"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[], "p_name_mode" "text", "p_max_posts_per_member" integer, "p_require_faction" boolean, "p_allow_faction_change" boolean, "p_allow_multiple_factions" boolean, "p_allow_faction_addition" boolean, "p_allow_deception" boolean, "p_min_evaluation_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_topic_with_rules"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[], "p_name_mode" "text", "p_max_posts_per_member" integer, "p_require_faction" boolean, "p_allow_faction_change" boolean, "p_allow_multiple_factions" boolean, "p_allow_faction_addition" boolean, "p_allow_deception" boolean, "p_min_evaluation_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_topic_with_rules"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[], "p_name_mode" "text", "p_max_posts_per_member" integer, "p_require_faction" boolean, "p_allow_faction_change" boolean, "p_allow_multiple_factions" boolean, "p_allow_faction_addition" boolean, "p_allow_deception" boolean, "p_min_evaluation_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_topic_with_rules"("p_title" "text", "p_summary" "text", "p_content" "text", "p_purpose" "text", "p_debate_type" "text", "p_ends_at" timestamp with time zone, "p_factions" "text"[], "p_name_mode" "text", "p_max_posts_per_member" integer, "p_require_faction" boolean, "p_allow_faction_change" boolean, "p_allow_multiple_factions" boolean, "p_allow_faction_addition" boolean, "p_allow_deception" boolean, "p_min_evaluation_points" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_fixed_role_faction_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_fixed_role_faction_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_fixed_role_faction_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_new_topic_rule_semantics"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_new_topic_rule_semantics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_new_topic_rule_semantics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_faction_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_faction_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_faction_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_topic_member_primary_faction"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_topic_member_primary_faction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_topic_member_primary_faction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_binary_faction_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_binary_faction_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_binary_faction_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_binary_topic_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_binary_topic_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_binary_topic_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_debate_type_post_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_debate_type_post_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_debate_type_post_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_reaction_allowed_by_topic_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_reaction_allowed_by_topic_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_reaction_allowed_by_topic_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_superiority_topic_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_superiority_topic_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_superiority_topic_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_topic_open_for_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_topic_open_for_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_topic_open_for_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_werewolf_faction_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_werewolf_faction_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_werewolf_faction_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_werewolf_topic_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_werewolf_topic_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_werewolf_topic_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_binary_final_result"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_binary_final_result"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_binary_final_result"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_faction_change_events"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_faction_change_events"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_faction_change_events"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_faction_change_events"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_evaluation_requirement"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_evaluation_requirement"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_evaluation_requirement"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_evaluation_requirement"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_post_reactions"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_post_reactions"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_post_reactions"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_post_reactions"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_post_usage"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_post_usage"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_post_usage"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_post_usage"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_topic_factions"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_topic_factions"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_topic_factions"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_topic_factions"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_werewolf_aliases"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_werewolf_aliases"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_werewolf_aliases"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_werewolf_aliases"("p_topic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_post_reaction_counts"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_post_reaction_counts"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_post_reaction_counts"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_superiority_final_result"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_superiority_final_result"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_superiority_final_result"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_superiority_final_result"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topic_faction_summary"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topic_faction_summary"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_topic_faction_summary"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topic_faction_summary"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topic_public_stats"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topic_public_stats"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_topic_public_stats"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topic_public_stats"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topic_recent_activity"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topic_recent_activity"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_topic_recent_activity"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topic_recent_activity"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topic_record_summary"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topic_record_summary"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_topic_record_summary"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topic_record_summary"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topics_public_stats"("p_topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topics_public_stats"("p_topic_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_topics_public_stats"("p_topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topics_public_stats"("p_topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topics_recent_activity"("p_topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topics_recent_activity"("p_topic_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_topics_recent_activity"("p_topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topics_recent_activity"("p_topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_werewolf_reveal_pairs"("p_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_werewolf_reveal_pairs"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_werewolf_reveal_pairs"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_werewolf_reveal_pairs"("p_topic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_reaction_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_reaction_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_reaction_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_topic_effectively_ended"("p_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_topic_effectively_ended"("p_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_topic_effectively_ended"("p_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_topic"("p_topic_id" "uuid", "p_speaker_name" "text", "p_faction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_topic"("p_topic_id" "uuid", "p_speaker_name" "text", "p_faction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."join_topic"("p_topic_id" "uuid", "p_speaker_name" "text", "p_faction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_topic"("p_topic_id" "uuid", "p_speaker_name" "text", "p_faction_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_werewolf_topic"("p_topic_id" "uuid", "p_primary_faction_id" "uuid", "p_faction_1_id" "uuid", "p_faction_1_name" "text", "p_faction_2_id" "uuid", "p_faction_2_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_werewolf_topic"("p_topic_id" "uuid", "p_primary_faction_id" "uuid", "p_faction_1_id" "uuid", "p_faction_1_name" "text", "p_faction_2_id" "uuid", "p_faction_2_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_werewolf_topic"("p_topic_id" "uuid", "p_primary_faction_id" "uuid", "p_faction_1_id" "uuid", "p_faction_1_name" "text", "p_faction_2_id" "uuid", "p_faction_2_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_werewolf_topic"("p_topic_id" "uuid", "p_primary_faction_id" "uuid", "p_faction_1_id" "uuid", "p_faction_1_name" "text", "p_faction_2_id" "uuid", "p_faction_2_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_evaluation_points"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_evaluation_points"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_evaluation_points"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_evaluation_points"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_activity_after_effective_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_activity_after_effective_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_activity_after_effective_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_affiliation_change_after_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_affiliation_change_after_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_affiliation_change_after_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_member_faction_change_after_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_member_faction_change_after_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_member_faction_change_after_end"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_my_topic_faction"("p_topic_id" "uuid", "p_faction_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_post_reaction"("p_post_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_post_reaction"("p_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_post_reaction"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_post_reaction"("p_post_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_post_reaction"("p_post_id" "uuid", "p_reaction_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_post_reaction"("p_post_id" "uuid", "p_reaction_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_post_reaction"("p_post_id" "uuid", "p_reaction_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_post_reaction"("p_post_id" "uuid", "p_reaction_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profile_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_topic_advanced_rules"("p_topic_id" "uuid", "p_end_mode" "text", "p_inactivity_timeout_minutes" integer, "p_shuffle_factions" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_topic_advanced_rules"("p_topic_id" "uuid", "p_end_mode" "text", "p_inactivity_timeout_minutes" integer, "p_shuffle_factions" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_topic_advanced_rules"("p_topic_id" "uuid", "p_end_mode" "text", "p_inactivity_timeout_minutes" integer, "p_shuffle_factions" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_topic_category"("p_topic_id" "uuid", "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_topic_category"("p_topic_id" "uuid", "p_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_topic_category"("p_topic_id" "uuid", "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_topic_category"("p_topic_id" "uuid", "p_category" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_werewolf_reveal_mode"("p_topic_id" "uuid", "p_reveal_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_werewolf_reveal_mode"("p_topic_id" "uuid", "p_reveal_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_werewolf_reveal_mode"("p_topic_id" "uuid", "p_reveal_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_werewolf_reveal_mode"("p_topic_id" "uuid", "p_reveal_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_primary_faction_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_primary_faction_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_primary_faction_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_superiority_faction_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_superiority_faction_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_superiority_faction_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_topic_last_post_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_topic_last_post_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_topic_last_post_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_topic_end_range"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_topic_end_range"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_topic_end_range"() TO "service_role";



GRANT ALL ON TABLE "public"."factions" TO "anon";
GRANT ALL ON TABLE "public"."factions" TO "authenticated";
GRANT ALL ON TABLE "public"."factions" TO "service_role";



GRANT ALL ON TABLE "public"."post_authors" TO "anon";
GRANT ALL ON TABLE "public"."post_authors" TO "authenticated";
GRANT ALL ON TABLE "public"."post_authors" TO "service_role";



GRANT ALL ON TABLE "public"."post_reactions" TO "anon";
GRANT ALL ON TABLE "public"."post_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."post_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("account_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."topic_rules" TO "anon";
GRANT ALL ON TABLE "public"."topic_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_rules" TO "service_role";



GRANT ALL ON TABLE "public"."topics" TO "anon";
GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";



GRANT ALL ON TABLE "public"."public_topics_with_end_state" TO "anon";
GRANT ALL ON TABLE "public"."public_topics_with_end_state" TO "authenticated";
GRANT ALL ON TABLE "public"."public_topics_with_end_state" TO "service_role";



GRANT ALL ON TABLE "public"."topic_creators" TO "anon";
GRANT ALL ON TABLE "public"."topic_creators" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_creators" TO "service_role";



GRANT ALL ON TABLE "public"."topic_faction_scores" TO "service_role";



GRANT ALL ON TABLE "public"."topic_member_faction_history" TO "anon";
GRANT ALL ON TABLE "public"."topic_member_faction_history" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_member_faction_history" TO "service_role";



GRANT ALL ON TABLE "public"."topic_member_factions" TO "service_role";



GRANT ALL ON TABLE "public"."topic_member_werewolf_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."topic_members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."topic_members" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_members" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







