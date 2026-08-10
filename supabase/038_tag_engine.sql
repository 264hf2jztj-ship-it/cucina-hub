begin;

create extension if not exists pgcrypto;

-- `tags` e `recipe_tags` esistono gia dalla Knowledge Base.
-- Il Tag Engine le riusa e aggiunge soltanto i collegamenti agli altri contenuti.
create table if not exists public.tag_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  tag_id uuid not null references public.tags(id) on delete cascade,
  knowledge_object_id uuid references public.knowledge_objects(id) on delete cascade,
  manual_id uuid references public.manuals(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  appliance_id uuid references public.appliances(id) on delete cascade,
  baking_session_id uuid references public.baking_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint tag_links_single_target check (
    num_nonnulls(
      knowledge_object_id,
      manual_id,
      course_id,
      appliance_id,
      baking_session_id
    ) = 1
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tags_name_not_blank'
      and conrelid = 'public.tags'::regclass
  ) then
    alter table public.tags
      add constraint tags_name_not_blank check (btrim(name) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tags_name_length'
      and conrelid = 'public.tags'::regclass
  ) then
    alter table public.tags
      add constraint tags_name_length check (char_length(btrim(name)) <= 80);
  end if;
end
$$;

create unique index if not exists tags_owner_normalized_name_key
on public.tags(owner_user_id, lower(btrim(name)));

create index if not exists tag_links_owner_tag_idx
on public.tag_links(owner_user_id, tag_id, created_at);

create unique index if not exists tag_links_knowledge_object_key
on public.tag_links(tag_id, knowledge_object_id)
where knowledge_object_id is not null;

create unique index if not exists tag_links_manual_key
on public.tag_links(tag_id, manual_id)
where manual_id is not null;

create unique index if not exists tag_links_course_key
on public.tag_links(tag_id, course_id)
where course_id is not null;

create unique index if not exists tag_links_appliance_key
on public.tag_links(tag_id, appliance_id)
where appliance_id is not null;

create unique index if not exists tag_links_baking_session_key
on public.tag_links(tag_id, baking_session_id)
where baking_session_id is not null;

alter table public.tag_links enable row level security;

drop policy if exists tag_links_owner_select on public.tag_links;
create policy tag_links_owner_select
on public.tag_links
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.tags tag
    where tag.id = tag_id
      and tag.owner_user_id = auth.uid()
  )
  and (
    (knowledge_object_id is not null and exists (
      select 1 from public.knowledge_objects knowledge_object
      where knowledge_object.id = knowledge_object_id
        and knowledge_object.owner_user_id = auth.uid()
    ))
    or (manual_id is not null and exists (
      select 1 from public.manuals manual
      where manual.id = manual_id
        and manual.owner_user_id = auth.uid()
    ))
    or (course_id is not null and exists (
      select 1 from public.courses course
      where course.id = course_id
        and course.owner_user_id = auth.uid()
    ))
    or (appliance_id is not null and exists (
      select 1 from public.appliances appliance
      where appliance.id = appliance_id
        and appliance.owner_user_id = auth.uid()
    ))
    or (baking_session_id is not null and exists (
      select 1 from public.baking_sessions baking_session
      where baking_session.id = baking_session_id
        and baking_session.owner_user_id = auth.uid()
    ))
  )
);

drop policy if exists tag_links_owner_insert on public.tag_links;
create policy tag_links_owner_insert
on public.tag_links
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.tags tag
    where tag.id = tag_id
      and tag.owner_user_id = auth.uid()
  )
  and (
    (knowledge_object_id is not null and exists (
      select 1 from public.knowledge_objects knowledge_object
      where knowledge_object.id = knowledge_object_id
        and knowledge_object.owner_user_id = auth.uid()
    ))
    or (manual_id is not null and exists (
      select 1 from public.manuals manual
      where manual.id = manual_id
        and manual.owner_user_id = auth.uid()
    ))
    or (course_id is not null and exists (
      select 1 from public.courses course
      where course.id = course_id
        and course.owner_user_id = auth.uid()
    ))
    or (appliance_id is not null and exists (
      select 1 from public.appliances appliance
      where appliance.id = appliance_id
        and appliance.owner_user_id = auth.uid()
    ))
    or (baking_session_id is not null and exists (
      select 1 from public.baking_sessions baking_session
      where baking_session.id = baking_session_id
        and baking_session.owner_user_id = auth.uid()
    ))
  )
);

drop policy if exists tag_links_owner_update on public.tag_links;
create policy tag_links_owner_update
on public.tag_links
for update
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.tags tag
    where tag.id = tag_id
      and tag.owner_user_id = auth.uid()
  )
  and (
    (knowledge_object_id is not null and exists (
      select 1 from public.knowledge_objects knowledge_object
      where knowledge_object.id = knowledge_object_id
        and knowledge_object.owner_user_id = auth.uid()
    ))
    or (manual_id is not null and exists (
      select 1 from public.manuals manual
      where manual.id = manual_id
        and manual.owner_user_id = auth.uid()
    ))
    or (course_id is not null and exists (
      select 1 from public.courses course
      where course.id = course_id
        and course.owner_user_id = auth.uid()
    ))
    or (appliance_id is not null and exists (
      select 1 from public.appliances appliance
      where appliance.id = appliance_id
        and appliance.owner_user_id = auth.uid()
    ))
    or (baking_session_id is not null and exists (
      select 1 from public.baking_sessions baking_session
      where baking_session.id = baking_session_id
        and baking_session.owner_user_id = auth.uid()
    ))
  )
);

drop policy if exists tag_links_owner_delete on public.tag_links;
create policy tag_links_owner_delete
on public.tag_links
for delete
using (owner_user_id = auth.uid());

grant select, insert, update, delete on public.tag_links to authenticated;

comment on table public.tag_links is
  'Collegamenti personali dei tag ai contenuti non-ricetta; le ricette continuano a usare recipe_tags.';

commit;

select
  to_regclass('public.tags') as tags,
  to_regclass('public.recipe_tags') as recipe_tags,
  to_regclass('public.tag_links') as tag_links,
  exists (
    select 1
    from pg_constraint
    where conname = 'tag_links_single_target'
      and conrelid = 'public.tag_links'::regclass
  ) as single_target_constraint,
  to_regclass('public.tags_owner_normalized_name_key') is not null
    as normalized_name_unique;
