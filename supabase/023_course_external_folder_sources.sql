begin;

create extension if not exists pgcrypto;

create table if not exists public.course_external_sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  category_id uuid references public.course_categories(id) on delete cascade,
  provider text not null default 'icloud',
  display_name text not null,
  folder_url text not null,
  base_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_external_sources_provider_allowed check (provider in ('icloud','google_drive','dropbox','onedrive','nextcloud','nas','generic')),
  constraint course_external_sources_name_not_blank check (btrim(display_name) <> ''),
  constraint course_external_sources_url_valid check (folder_url ~* '^https?://'),
  constraint course_external_sources_owner_course_category_key unique (owner_user_id, course_id, category_id)
);

create table if not exists public.course_content_external_refs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  content_id uuid not null references public.course_contents(id) on delete cascade,
  source_id uuid not null references public.course_external_sources(id) on delete cascade,
  relative_path text not null,
  file_role text not null default 'primary',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_content_external_refs_path_not_blank check (btrim(relative_path) <> ''),
  constraint course_content_external_refs_role_allowed check (file_role in ('primary','supplementary','cover','transcript','thumbnail')),
  constraint course_content_external_refs_content_source_key unique (content_id, source_id)
);

create index if not exists course_external_sources_course_idx on public.course_external_sources(course_id, category_id);
create index if not exists course_content_external_refs_content_idx on public.course_content_external_refs(content_id);
create index if not exists course_content_external_refs_source_idx on public.course_content_external_refs(source_id);

alter table public.course_external_sources enable row level security;
alter table public.course_content_external_refs enable row level security;

drop policy if exists course_external_sources_owner_all on public.course_external_sources;
create policy course_external_sources_owner_all on public.course_external_sources
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists course_content_external_refs_owner_all on public.course_content_external_refs;
create policy course_content_external_refs_owner_all on public.course_content_external_refs
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

grant select, insert, update, delete on public.course_external_sources to authenticated;
grant select, insert, update, delete on public.course_content_external_refs to authenticated;

commit;

select
  to_regclass('public.course_external_sources') as course_external_sources,
  to_regclass('public.course_content_external_refs') as course_content_external_refs;
