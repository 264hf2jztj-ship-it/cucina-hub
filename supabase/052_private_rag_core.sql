begin;

create extension if not exists pgcrypto;

create table if not exists public.rag_source_indexes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  manual_id uuid references public.manuals(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  knowledge_object_id uuid references public.knowledge_objects(id) on delete cascade,
  display_name text not null,
  access_status text not null default 'metadata_only',
  original_provider text not null default 'supabase',
  source_locator text,
  content_hash text,
  chunk_count integer not null default 0,
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_source_indexes_single_target check (
    num_nonnulls(manual_id, course_id, knowledge_object_id) = 1
  ),
  constraint rag_source_indexes_status_allowed check (
    access_status in ('indexed', 'metadata_only', 'unavailable')
  ),
  constraint rag_source_indexes_provider_allowed check (
    original_provider in ('supabase', 'icloud', 'external', 'knowledge')
  ),
  constraint rag_source_indexes_name_not_blank check (btrim(display_name) <> ''),
  constraint rag_source_indexes_name_length check (char_length(display_name) <= 240),
  constraint rag_source_indexes_locator_length check (
    source_locator is null or char_length(source_locator) <= 2000
  ),
  constraint rag_source_indexes_chunk_count_nonnegative check (chunk_count >= 0)
);

create table if not exists public.rag_source_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  source_index_id uuid not null
    references public.rag_source_indexes(id) on delete cascade,
  chunk_number integer not null,
  heading text,
  locator text,
  content text not null,
  token_estimate integer,
  search_vector tsvector generated always as (
    to_tsvector('italian', coalesce(heading, '') || ' ' || content)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_source_chunks_number_nonnegative check (chunk_number >= 0),
  constraint rag_source_chunks_heading_length check (
    heading is null or char_length(heading) <= 300
  ),
  constraint rag_source_chunks_locator_length check (
    locator is null or char_length(locator) <= 500
  ),
  constraint rag_source_chunks_content_not_blank check (btrim(content) <> ''),
  constraint rag_source_chunks_content_length check (char_length(content) <= 8000),
  constraint rag_source_chunks_token_nonnegative check (
    token_estimate is null or token_estimate >= 0
  ),
  constraint rag_source_chunks_source_number_key unique (source_index_id, chunk_number)
);

create unique index if not exists rag_source_indexes_manual_key
on public.rag_source_indexes(owner_user_id, manual_id)
where manual_id is not null;

create unique index if not exists rag_source_indexes_course_key
on public.rag_source_indexes(owner_user_id, course_id)
where course_id is not null;

create unique index if not exists rag_source_indexes_knowledge_key
on public.rag_source_indexes(owner_user_id, knowledge_object_id)
where knowledge_object_id is not null;

create index if not exists rag_source_indexes_owner_status_idx
on public.rag_source_indexes(owner_user_id, access_status, updated_at desc);

create index if not exists rag_source_chunks_owner_source_idx
on public.rag_source_chunks(owner_user_id, source_index_id, chunk_number);

create index if not exists rag_source_chunks_search_idx
on public.rag_source_chunks using gin(search_vector);

alter table public.rag_source_indexes enable row level security;
alter table public.rag_source_chunks enable row level security;

drop policy if exists rag_source_indexes_owner_select on public.rag_source_indexes;
create policy rag_source_indexes_owner_select
on public.rag_source_indexes for select to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists rag_source_indexes_owner_insert on public.rag_source_indexes;
create policy rag_source_indexes_owner_insert
on public.rag_source_indexes for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and (
    (manual_id is not null and exists (
      select 1 from public.manuals m
      where m.id = manual_id and m.owner_user_id = (select auth.uid())
    ))
    or (course_id is not null and exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_user_id = (select auth.uid())
    ))
    or (knowledge_object_id is not null and exists (
      select 1 from public.knowledge_objects k
      where k.id = knowledge_object_id and k.owner_user_id = (select auth.uid())
    ))
  )
);

drop policy if exists rag_source_indexes_owner_update on public.rag_source_indexes;
create policy rag_source_indexes_owner_update
on public.rag_source_indexes for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and (
    (manual_id is not null and exists (
      select 1 from public.manuals m
      where m.id = manual_id and m.owner_user_id = (select auth.uid())
    ))
    or (course_id is not null and exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_user_id = (select auth.uid())
    ))
    or (knowledge_object_id is not null and exists (
      select 1 from public.knowledge_objects k
      where k.id = knowledge_object_id and k.owner_user_id = (select auth.uid())
    ))
  )
);

drop policy if exists rag_source_indexes_owner_delete on public.rag_source_indexes;
create policy rag_source_indexes_owner_delete
on public.rag_source_indexes for delete to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists rag_source_chunks_owner_select on public.rag_source_chunks;
create policy rag_source_chunks_owner_select
on public.rag_source_chunks for select to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.rag_source_indexes source
    where source.id = source_index_id
      and source.owner_user_id = (select auth.uid())
  )
);

drop policy if exists rag_source_chunks_owner_insert on public.rag_source_chunks;
create policy rag_source_chunks_owner_insert
on public.rag_source_chunks for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.rag_source_indexes source
    where source.id = source_index_id
      and source.owner_user_id = (select auth.uid())
  )
);

drop policy if exists rag_source_chunks_owner_update on public.rag_source_chunks;
create policy rag_source_chunks_owner_update
on public.rag_source_chunks for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.rag_source_indexes source
    where source.id = source_index_id
      and source.owner_user_id = (select auth.uid())
  )
);

drop policy if exists rag_source_chunks_owner_delete on public.rag_source_chunks;
create policy rag_source_chunks_owner_delete
on public.rag_source_chunks for delete to authenticated
using ((select auth.uid()) = owner_user_id);

grant select, insert, update, delete on public.rag_source_indexes to authenticated;
grant select, insert, update, delete on public.rag_source_chunks to authenticated;

create or replace function public.refresh_rag_source_stats()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_id uuid := coalesce(new.source_index_id, old.source_index_id);
begin
  update public.rag_source_indexes source
  set chunk_count = stats.chunk_count,
      access_status = case
        when stats.chunk_count > 0 then 'indexed'
        when source.access_status = 'unavailable' then 'unavailable'
        else 'metadata_only'
      end,
      indexed_at = case when stats.chunk_count > 0 then now() else null end,
      updated_at = now()
  from (
    select count(*)::integer as chunk_count
    from public.rag_source_chunks
    where source_index_id = target_id
  ) stats
  where source.id = target_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists rag_source_chunks_refresh_stats on public.rag_source_chunks;
create trigger rag_source_chunks_refresh_stats
after insert or update or delete on public.rag_source_chunks
for each row execute function public.refresh_rag_source_stats();

create or replace function public.search_rag_sources(
  p_query text,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  source_index_id uuid,
  source_kind text,
  source_entity_id uuid,
  display_name text,
  heading text,
  locator text,
  content text,
  rank real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with query as (
    select websearch_to_tsquery('italian', left(btrim(coalesce(p_query, '')), 300)) as value
  )
  select
    chunk.id,
    source.id,
    case
      when source.manual_id is not null then 'manual'
      when source.course_id is not null then 'course'
      else 'knowledge_object'
    end,
    coalesce(source.manual_id, source.course_id, source.knowledge_object_id),
    source.display_name,
    chunk.heading,
    chunk.locator,
    chunk.content,
    ts_rank_cd(chunk.search_vector, query.value)::real
  from public.rag_source_chunks chunk
  join public.rag_source_indexes source on source.id = chunk.source_index_id
  cross join query
  where (select auth.uid()) is not null
    and source.owner_user_id = (select auth.uid())
    and chunk.owner_user_id = (select auth.uid())
    and source.access_status = 'indexed'
    and btrim(coalesce(p_query, '')) <> ''
    and chunk.search_vector @@ query.value
  order by ts_rank_cd(chunk.search_vector, query.value) desc, source.display_name, chunk.chunk_number
  limit least(greatest(coalesce(p_limit, 8), 1), 12);
$$;

revoke all on function public.search_rag_sources(text, integer) from public, anon;
grant execute on function public.search_rag_sources(text, integer) to authenticated;

insert into public.rag_source_indexes (
  owner_user_id, knowledge_object_id, display_name, access_status, original_provider
)
select
  owner_user_id,
  id,
  title,
  case when btrim(coalesce(description, '')) <> '' then 'indexed' else 'metadata_only' end,
  'knowledge'
from public.knowledge_objects
on conflict (owner_user_id, knowledge_object_id) where knowledge_object_id is not null
do update set display_name = excluded.display_name, updated_at = now();

insert into public.rag_source_indexes (
  owner_user_id, manual_id, display_name, access_status, original_provider
)
select owner_user_id, id, title, 'metadata_only', 'supabase'
from public.manuals
on conflict (owner_user_id, manual_id) where manual_id is not null
do update set display_name = excluded.display_name, updated_at = now();

insert into public.rag_source_indexes (
  owner_user_id, course_id, display_name, access_status, original_provider, source_locator
)
select
  owner_user_id,
  id,
  title,
  'metadata_only',
  case when coalesce(source_reference, '') ilike '%icloud%' then 'icloud' else 'external' end,
  source_reference
from public.courses
on conflict (owner_user_id, course_id) where course_id is not null
do update set
  display_name = excluded.display_name,
  original_provider = excluded.original_provider,
  source_locator = excluded.source_locator,
  updated_at = now();

insert into public.rag_source_chunks (
  owner_user_id, source_index_id, chunk_number, heading, locator, content, token_estimate
)
select
  object.owner_user_id,
  source.id,
  0,
  object.title,
  'Knowledge Object',
  object.description,
  greatest(1, ceil(char_length(object.description) / 4.0)::integer)
from public.knowledge_objects object
join public.rag_source_indexes source on source.knowledge_object_id = object.id
where btrim(coalesce(object.description, '')) <> ''
on conflict (source_index_id, chunk_number)
do update set
  heading = excluded.heading,
  content = excluded.content,
  token_estimate = excluded.token_estimate,
  updated_at = now();

comment on table public.rag_source_indexes is
  'Catalogo privato delle fonti AI; conserva riferimenti e stato senza duplicare gli originali.';
comment on table public.rag_source_chunks is
  'Frammenti testuali privati e ricercabili usati dal RAG di Cucina Hub.';
comment on function public.search_rag_sources(text, integer) is
  'Recupera soltanto frammenti indicizzati appartenenti all utente autenticato.';

commit;

select
  to_regclass('public.rag_source_indexes') is not null as source_indexes,
  to_regclass('public.rag_source_chunks') is not null as source_chunks,
  to_regprocedure('public.search_rag_sources(text,integer)') is not null as search_function,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'rag_source_chunks_search_idx'
  ) as gin_index,
  exists (
    select 1 from pg_class
    where oid = 'public.rag_source_indexes'::regclass and relrowsecurity
  ) as source_rls,
  exists (
    select 1 from pg_class
    where oid = 'public.rag_source_chunks'::regclass and relrowsecurity
  ) as chunk_rls,
  has_function_privilege('authenticated', 'public.search_rag_sources(text,integer)', 'EXECUTE') as authenticated_search_access;
