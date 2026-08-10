begin;

create extension if not exists pgcrypto;

create table if not exists public.knowledge_relations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  source_knowledge_object_id uuid not null
    references public.knowledge_objects(id) on delete cascade,
  target_knowledge_object_id uuid not null
    references public.knowledge_objects(id) on delete cascade,
  relation_type text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint knowledge_relations_distinct_objects check (
    source_knowledge_object_id <> target_knowledge_object_id
  ),
  constraint knowledge_relations_type_allowed check (
    relation_type in (
      'uses',
      'compatible_with',
      'derives_from',
      'replaces',
      'requires',
      'related_to',
      'executed_with',
      'improved_by'
    )
  ),
  constraint knowledge_relations_note_length check (
    note is null or char_length(note) <= 1000
  )
);

create index if not exists knowledge_relations_owner_source_idx
on public.knowledge_relations(owner_user_id, source_knowledge_object_id, created_at);

create index if not exists knowledge_relations_owner_target_idx
on public.knowledge_relations(owner_user_id, target_knowledge_object_id, created_at);

create unique index if not exists knowledge_relations_directional_key
on public.knowledge_relations(
  owner_user_id,
  source_knowledge_object_id,
  target_knowledge_object_id,
  relation_type
);

-- `compatibile con` e `correlato a` sono simmetriche: A→B e B→A sono lo stesso arco.
create unique index if not exists knowledge_relations_symmetric_key
on public.knowledge_relations(
  owner_user_id,
  least(source_knowledge_object_id::text, target_knowledge_object_id::text),
  greatest(source_knowledge_object_id::text, target_knowledge_object_id::text),
  relation_type
)
where relation_type in ('compatible_with', 'related_to');

alter table public.knowledge_relations enable row level security;

drop policy if exists knowledge_relations_owner_select on public.knowledge_relations;
create policy knowledge_relations_owner_select
on public.knowledge_relations
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects source_object
    where source_object.id = source_knowledge_object_id
      and source_object.owner_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.knowledge_objects target_object
    where target_object.id = target_knowledge_object_id
      and target_object.owner_user_id = auth.uid()
  )
);

drop policy if exists knowledge_relations_owner_insert on public.knowledge_relations;
create policy knowledge_relations_owner_insert
on public.knowledge_relations
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects source_object
    where source_object.id = source_knowledge_object_id
      and source_object.owner_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.knowledge_objects target_object
    where target_object.id = target_knowledge_object_id
      and target_object.owner_user_id = auth.uid()
  )
);

drop policy if exists knowledge_relations_owner_update on public.knowledge_relations;
create policy knowledge_relations_owner_update
on public.knowledge_relations
for update
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects source_object
    where source_object.id = source_knowledge_object_id
      and source_object.owner_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.knowledge_objects target_object
    where target_object.id = target_knowledge_object_id
      and target_object.owner_user_id = auth.uid()
  )
);

drop policy if exists knowledge_relations_owner_delete on public.knowledge_relations;
create policy knowledge_relations_owner_delete
on public.knowledge_relations
for delete
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects source_object
    where source_object.id = source_knowledge_object_id
      and source_object.owner_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.knowledge_objects target_object
    where target_object.id = target_knowledge_object_id
      and target_object.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.knowledge_relations to authenticated;

comment on table public.knowledge_relations is
  'Archi espliciti e tipizzati tra Knowledge Object personali; nessuna relazione viene inferita automaticamente.';

commit;

select
  to_regclass('public.knowledge_relations') as knowledge_relations,
  exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_relations_distinct_objects'
      and conrelid = 'public.knowledge_relations'::regclass
  ) as distinct_objects_constraint,
  exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_relations_type_allowed'
      and conrelid = 'public.knowledge_relations'::regclass
  ) as allowed_types_constraint,
  to_regclass('public.knowledge_relations_symmetric_key') is not null
    as symmetric_unique_index;
