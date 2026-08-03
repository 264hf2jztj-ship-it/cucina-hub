begin;

create extension if not exists pgcrypto;

create table if not exists public.course_categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_categories_name_not_blank check (btrim(name) <> ''),
  constraint course_categories_slug_not_blank check (btrim(slug) <> ''),
  constraint course_categories_owner_course_slug_key unique (owner_user_id, course_id, slug)
);

create table if not exists public.course_contents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  category_id uuid not null references public.course_categories(id) on delete cascade,
  title text not null,
  content_type text not null,
  source_filename text not null,
  source_path text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_contents_title_not_blank check (btrim(title) <> ''),
  constraint course_contents_type_allowed check (content_type in ('video','pdf','image','other')),
  constraint course_contents_source_path_not_blank check (btrim(source_path) <> ''),
  constraint course_contents_owner_course_path_key unique (owner_user_id, course_id, source_path)
);

create table if not exists public.course_content_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  content_id uuid not null references public.course_contents(id) on delete cascade,
  storage_file_id uuid not null references public.storage_files(id) on delete cascade,
  file_role text not null default 'primary',
  created_at timestamptz not null default now(),
  constraint course_content_files_role_allowed check (file_role in ('primary','supplementary','cover','transcript','thumbnail')),
  constraint course_content_files_content_storage_key unique (content_id, storage_file_id)
);

create index if not exists course_categories_course_idx on public.course_categories(course_id, sort_order, name);
create index if not exists course_contents_category_idx on public.course_contents(category_id, sort_order, title);
create index if not exists course_contents_course_idx on public.course_contents(course_id, content_type);
create index if not exists course_content_files_content_idx on public.course_content_files(content_id);

alter table public.course_categories enable row level security;
alter table public.course_contents enable row level security;
alter table public.course_content_files enable row level security;

drop policy if exists course_categories_owner_all on public.course_categories;
create policy course_categories_owner_all on public.course_categories
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists course_contents_owner_all on public.course_contents;
create policy course_contents_owner_all on public.course_contents
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists course_content_files_owner_all on public.course_content_files;
create policy course_content_files_owner_all on public.course_content_files
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

commit;

select
  to_regclass('public.course_categories') as course_categories,
  to_regclass('public.course_contents') as course_contents,
  to_regclass('public.course_content_files') as course_content_files;
