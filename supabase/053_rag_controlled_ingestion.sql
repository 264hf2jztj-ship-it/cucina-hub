begin;

create index if not exists rag_source_indexes_manual_id_idx
on public.rag_source_indexes(manual_id);

create index if not exists rag_source_indexes_course_id_idx
on public.rag_source_indexes(course_id);

create index if not exists rag_source_indexes_knowledge_object_id_idx
on public.rag_source_indexes(knowledge_object_id);

create or replace function public.replace_rag_source_chunks(
  p_source_index_id uuid,
  p_chunks jsonb,
  p_content_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_chunk_count integer;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if p_source_index_id is null then
    raise exception 'Source index is required';
  end if;

  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' then
    raise exception 'Chunks must be a JSON array';
  end if;

  v_chunk_count := jsonb_array_length(p_chunks);
  if v_chunk_count < 1 or v_chunk_count > 400 then
    raise exception 'Chunks must contain between 1 and 400 items';
  end if;

  if p_content_hash is not null and char_length(p_content_hash) > 128 then
    raise exception 'Content hash is too long';
  end if;

  if not exists (
    select 1
    from public.rag_source_indexes source
    where source.id = p_source_index_id
      and source.owner_user_id = v_owner_id
  ) then
    raise exception 'Source not found or not owned by current user';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_chunks) item
    where jsonb_typeof(item) <> 'object'
      or btrim(coalesce(item ->> 'content', '')) = ''
      or char_length(item ->> 'content') > 8000
      or char_length(coalesce(item ->> 'heading', '')) > 300
      or char_length(coalesce(item ->> 'locator', '')) > 500
  ) then
    raise exception 'One or more chunks are invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_index_id::text, 0));

  delete from public.rag_source_chunks chunk
  where chunk.source_index_id = p_source_index_id
    and chunk.owner_user_id = v_owner_id;

  insert into public.rag_source_chunks (
    owner_user_id,
    source_index_id,
    chunk_number,
    heading,
    locator,
    content,
    token_estimate
  )
  select
    v_owner_id,
    p_source_index_id,
    (item.ordinality - 1)::integer,
    nullif(btrim(item.value ->> 'heading'), ''),
    nullif(btrim(item.value ->> 'locator'), ''),
    btrim(item.value ->> 'content'),
    greatest(1, ceil(char_length(btrim(item.value ->> 'content')) / 4.0)::integer)
  from jsonb_array_elements(p_chunks) with ordinality as item(value, ordinality);

  update public.rag_source_indexes source
  set content_hash = nullif(btrim(p_content_hash), ''),
      access_status = 'indexed',
      chunk_count = v_chunk_count,
      indexed_at = now(),
      updated_at = now()
  where source.id = p_source_index_id
    and source.owner_user_id = v_owner_id;

  return jsonb_build_object(
    'source_index_id', p_source_index_id,
    'chunk_count', v_chunk_count,
    'access_status', 'indexed'
  );
end;
$$;

revoke all on function public.replace_rag_source_chunks(uuid, jsonb, text) from public, anon;
grant execute on function public.replace_rag_source_chunks(uuid, jsonb, text) to authenticated;

comment on function public.replace_rag_source_chunks(uuid, jsonb, text) is
  'Sostituisce atomicamente i frammenti di una fonte appartenente all utente autenticato.';

commit;

select
  to_regprocedure('public.replace_rag_source_chunks(uuid,jsonb,text)') is not null as ingestion_function,
  has_function_privilege('authenticated', 'public.replace_rag_source_chunks(uuid,jsonb,text)', 'EXECUTE') as authenticated_access,
  not has_function_privilege('anon', 'public.replace_rag_source_chunks(uuid,jsonb,text)', 'EXECUTE') as anon_blocked,
  not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'replace_rag_source_chunks'
      and procedure.prosecdef
  ) as security_invoker;
