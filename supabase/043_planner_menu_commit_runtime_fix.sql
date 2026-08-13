begin;

do $$
begin
  if to_regprocedure('public.commit_planner_menu_package(jsonb,text,text,jsonb,boolean)') is null then
    raise exception 'planner_menu_migration_042_required';
  end if;

  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'planner_menu_pgcrypto_digest_required_in_extensions';
  end if;
end;
$$;

alter function public.commit_planner_menu_package(jsonb, text, text, jsonb, boolean)
  set search_path = public, extensions, pg_temp;

comment on function public.commit_planner_menu_package(jsonb, text, text, jsonb, boolean) is
  'Conferma e salva atomicamente un cucina-hub.menu-plan v1; il runtime include esplicitamente lo schema pgcrypto per la verifica SHA-256.';

commit;

notify pgrst, 'reload schema';

select
  to_regprocedure('extensions.digest(bytea,text)') is not null as pgcrypto_digest_available,
  procedure.proconfig as commit_function_config,
  has_function_privilege(
    'authenticated',
    'public.commit_planner_menu_package(jsonb,text,text,jsonb,boolean)',
    'EXECUTE'
  ) as authenticated_can_commit
from pg_proc procedure
where procedure.oid = 'public.commit_planner_menu_package(jsonb,text,text,jsonb,boolean)'::regprocedure;
