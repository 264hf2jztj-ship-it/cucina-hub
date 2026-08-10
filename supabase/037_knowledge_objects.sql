begin;

create extension if not exists pgcrypto;

create table if not exists public.knowledge_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_objects_title_not_blank check (btrim(title) <> ''),
  constraint knowledge_objects_title_length check (char_length(btrim(title)) <= 160),
  constraint knowledge_objects_description_length check (
    description is null or char_length(description) <= 4000
  ),
  constraint knowledge_objects_owner_title_key unique (owner_user_id, title)
);

create table if not exists public.knowledge_object_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  knowledge_object_id uuid not null
    references public.knowledge_objects(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  manual_id uuid references public.manuals(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  appliance_id uuid references public.appliances(id) on delete cascade,
  baking_session_id uuid references public.baking_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint knowledge_object_links_single_target check (
    num_nonnulls(
      recipe_id,
      manual_id,
      course_id,
      appliance_id,
      baking_session_id
    ) = 1
  )
);

create index if not exists knowledge_objects_owner_updated_idx
on public.knowledge_objects(owner_user_id, updated_at desc);

create index if not exists knowledge_object_links_owner_object_idx
on public.knowledge_object_links(owner_user_id, knowledge_object_id, created_at);

create unique index if not exists knowledge_object_links_recipe_key
on public.knowledge_object_links(knowledge_object_id, recipe_id)
where recipe_id is not null;

create unique index if not exists knowledge_object_links_manual_key
on public.knowledge_object_links(knowledge_object_id, manual_id)
where manual_id is not null;

create unique index if not exists knowledge_object_links_course_key
on public.knowledge_object_links(knowledge_object_id, course_id)
where course_id is not null;

create unique index if not exists knowledge_object_links_appliance_key
on public.knowledge_object_links(knowledge_object_id, appliance_id)
where appliance_id is not null;

create unique index if not exists knowledge_object_links_baking_session_key
on public.knowledge_object_links(knowledge_object_id, baking_session_id)
where baking_session_id is not null;

alter table public.knowledge_objects enable row level security;
alter table public.knowledge_object_links enable row level security;

drop policy if exists knowledge_objects_owner_select on public.knowledge_objects;
create policy knowledge_objects_owner_select
on public.knowledge_objects
for select
using (owner_user_id = auth.uid());

drop policy if exists knowledge_objects_owner_insert on public.knowledge_objects;
create policy knowledge_objects_owner_insert
on public.knowledge_objects
for insert
with check (owner_user_id = auth.uid());

drop policy if exists knowledge_objects_owner_update on public.knowledge_objects;
create policy knowledge_objects_owner_update
on public.knowledge_objects
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists knowledge_objects_owner_delete on public.knowledge_objects;
create policy knowledge_objects_owner_delete
on public.knowledge_objects
for delete
using (owner_user_id = auth.uid());

drop policy if exists knowledge_object_links_owner_select on public.knowledge_object_links;
create policy knowledge_object_links_owner_select
on public.knowledge_object_links
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects knowledge_object
    where knowledge_object.id = knowledge_object_id
      and knowledge_object.owner_user_id = auth.uid()
  )
  and (
    (recipe_id is not null and exists (
      select 1 from public.recipes recipe
      where recipe.id = recipe_id and recipe.owner_user_id = auth.uid()
    ))
    or (manual_id is not null and exists (
      select 1 from public.manuals manual
      where manual.id = manual_id and manual.owner_user_id = auth.uid()
    ))
    or (course_id is not null and exists (
      select 1 from public.courses course
      where course.id = course_id and course.owner_user_id = auth.uid()
    ))
    or (appliance_id is not null and exists (
      select 1 from public.appliances appliance
      where appliance.id = appliance_id and appliance.owner_user_id = auth.uid()
    ))
    or (baking_session_id is not null and exists (
      select 1 from public.baking_sessions baking_session
      where baking_session.id = baking_session_id
        and baking_session.owner_user_id = auth.uid()
    ))
  )
);

drop policy if exists knowledge_object_links_owner_insert on public.knowledge_object_links;
create policy knowledge_object_links_owner_insert
on public.knowledge_object_links
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects knowledge_object
    where knowledge_object.id = knowledge_object_id
      and knowledge_object.owner_user_id = auth.uid()
  )
  and (
    (recipe_id is not null and exists (
      select 1 from public.recipes recipe
      where recipe.id = recipe_id and recipe.owner_user_id = auth.uid()
    ))
    or (manual_id is not null and exists (
      select 1 from public.manuals manual
      where manual.id = manual_id and manual.owner_user_id = auth.uid()
    ))
    or (course_id is not null and exists (
      select 1 from public.courses course
      where course.id = course_id and course.owner_user_id = auth.uid()
    ))
    or (appliance_id is not null and exists (
      select 1 from public.appliances appliance
      where appliance.id = appliance_id and appliance.owner_user_id = auth.uid()
    ))
    or (baking_session_id is not null and exists (
      select 1 from public.baking_sessions baking_session
      where baking_session.id = baking_session_id
        and baking_session.owner_user_id = auth.uid()
    ))
  )
);

drop policy if exists knowledge_object_links_owner_update on public.knowledge_object_links;
create policy knowledge_object_links_owner_update
on public.knowledge_object_links
for update
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects knowledge_object
    where knowledge_object.id = knowledge_object_id
      and knowledge_object.owner_user_id = auth.uid()
  )
  and (
    (recipe_id is not null and exists (
      select 1 from public.recipes recipe
      where recipe.id = recipe_id and recipe.owner_user_id = auth.uid()
    ))
    or (manual_id is not null and exists (
      select 1 from public.manuals manual
      where manual.id = manual_id and manual.owner_user_id = auth.uid()
    ))
    or (course_id is not null and exists (
      select 1 from public.courses course
      where course.id = course_id and course.owner_user_id = auth.uid()
    ))
    or (appliance_id is not null and exists (
      select 1 from public.appliances appliance
      where appliance.id = appliance_id and appliance.owner_user_id = auth.uid()
    ))
    or (baking_session_id is not null and exists (
      select 1 from public.baking_sessions baking_session
      where baking_session.id = baking_session_id
        and baking_session.owner_user_id = auth.uid()
    ))
  )
);

drop policy if exists knowledge_object_links_owner_delete on public.knowledge_object_links;
create policy knowledge_object_links_owner_delete
on public.knowledge_object_links
for delete
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.knowledge_objects knowledge_object
    where knowledge_object.id = knowledge_object_id
      and knowledge_object.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.knowledge_objects to authenticated;
grant select, insert, update, delete on public.knowledge_object_links to authenticated;

comment on table public.knowledge_objects is
  'Concetti culinari personali che aggregano fonti senza copiarne i contenuti.';

comment on table public.knowledge_object_links is
  'Collegamenti tipizzati tra un Knowledge Object e una singola entita originale.';

commit;

select
  to_regclass('public.knowledge_objects') as knowledge_objects,
  to_regclass('public.knowledge_object_links') as knowledge_object_links,
  exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_object_links_single_target'
  ) as single_target_constraint;
