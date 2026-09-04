-- The application uses create_topic_with_rules(...) and the five-argument
-- create_post(...). Keep these legacy overloads for database compatibility,
-- but remove them from the public Data API surface.
revoke execute on function public.create_topic(
  text,
  text,
  text,
  text,
  text,
  timestamp with time zone,
  text[]
) from public, anon, authenticated;

revoke execute on function public.create_post(
  uuid,
  text,
  uuid,
  text
) from public, anon, authenticated;

do $verify_legacy_rpc_acl$
declare
  v_create_topic regprocedure := to_regprocedure(
    'public.create_topic(text,text,text,text,text,timestamp with time zone,text[])'
  );
  v_create_post regprocedure := to_regprocedure(
    'public.create_post(uuid,text,uuid,text)'
  );
begin
  if v_create_topic is null or v_create_post is null then
    raise exception 'Expected legacy RPC overload is missing';
  end if;

  if has_function_privilege('public', v_create_topic, 'execute')
     or has_function_privilege('anon', v_create_topic, 'execute')
     or has_function_privilege('authenticated', v_create_topic, 'execute')
     or has_function_privilege('public', v_create_post, 'execute')
     or has_function_privilege('anon', v_create_post, 'execute')
     or has_function_privilege('authenticated', v_create_post, 'execute') then
    raise exception 'Legacy RPC EXECUTE privileges were not fully revoked';
  end if;

  if not has_function_privilege('service_role', v_create_topic, 'execute')
     or not has_function_privilege('service_role', v_create_post, 'execute') then
    raise exception 'Legacy RPC service_role EXECUTE privilege must be preserved';
  end if;
end;
$verify_legacy_rpc_acl$;
