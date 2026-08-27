-- Cucina Hub — RAG natural-language search fallback.
-- Keep exact multi-term matches first; use ranked OR terms only when exact search is empty.

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
  with query_terms as (
    select
      websearch_to_tsquery(
        'italian',
        left(btrim(coalesce(p_query, '')), 300)
      ) as strict_query,
      replace(
        plainto_tsquery(
          'italian',
          left(btrim(coalesce(p_query, '')), 300)
        )::text,
        ' & ',
        ' | '
      )::tsquery as broad_query
  ),
  scored as (
    select
      chunk.id as chunk_id,
      source.id as source_index_id,
      case
        when source.manual_id is not null then 'manual'
        when source.course_id is not null then 'course'
        else 'knowledge_object'
      end as source_kind,
      coalesce(source.manual_id, source.course_id, source.knowledge_object_id) as source_entity_id,
      source.display_name,
      chunk.heading,
      chunk.locator,
      chunk.content,
      chunk.chunk_number,
      chunk.search_vector @@ query_terms.strict_query as strict_match,
      (
        case
          when chunk.search_vector @@ query_terms.strict_query
            then 1 + ts_rank_cd(chunk.search_vector, query_terms.strict_query)
          else ts_rank_cd(chunk.search_vector, query_terms.broad_query)
        end
      )::real as relevance
    from public.rag_source_chunks chunk
    join public.rag_source_indexes source on source.id = chunk.source_index_id
    cross join query_terms
    where (select auth.uid()) is not null
      and source.owner_user_id = (select auth.uid())
      and chunk.owner_user_id = (select auth.uid())
      and source.access_status = 'indexed'
      and btrim(coalesce(p_query, '')) <> ''
      and chunk.search_vector @@ query_terms.broad_query
  ),
  filtered as (
    select scored.*
    from scored
    where scored.strict_match
      or not exists (
        select 1
        from scored strict_result
        where strict_result.strict_match
      )
  )
  select
    filtered.chunk_id,
    filtered.source_index_id,
    filtered.source_kind,
    filtered.source_entity_id,
    filtered.display_name,
    filtered.heading,
    filtered.locator,
    filtered.content,
    filtered.relevance
  from filtered
  order by filtered.relevance desc, filtered.display_name, filtered.chunk_number
  limit least(greatest(coalesce(p_limit, 8), 1), 12);
$$;

revoke all on function public.search_rag_sources(text, integer) from public, anon;
grant execute on function public.search_rag_sources(text, integer) to authenticated;

comment on function public.search_rag_sources(text, integer) is
  'Searches the authenticated owner RAG chunks. Strict matches win; ranked individual terms are used only when strict search returns no rows.';
