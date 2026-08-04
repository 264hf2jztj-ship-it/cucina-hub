begin;

create table if not exists public.course_content_external_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  content_id uuid not null references public.course_contents(id) on delete cascade,
  provider text not null default 'generic',
  external_url text not null,
  display_name text not null,
  file_role text not null default 'primary',
  mime_type text,
  size_bytes bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_external_provider_allowed check (provider in ('icloud','google_drive','dropbox','onedrive','nas','generic')),
  constraint course_external_url_valid check (external_url ~* '^https?://'),
  constraint course_external_name_not_blank check (btrim(display_name) <> ''),
  constraint course_external_role_allowed check (file_role in ('primary','supplementary','cover','transcript','thumbnail')),
  constraint course_external_size_nonnegative check (size_bytes is null or size_bytes >= 0),
  constraint course_external_content_url_key unique (content_id, external_url)
);

create index if not exists course_external_content_idx
  on public.course_content_external_links(content_id, file_role, display_name);

alter table public.course_content_external_links enable row level security;

drop policy if exists course_external_owner_all on public.course_content_external_links;
create policy course_external_owner_all on public.course_content_external_links
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

grant select, insert, update, delete on public.course_content_external_links to authenticated;

commit;

select
  to_regclass('public.course_content_external_links') as course_content_external_links,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.course_content_external_links'::regclass
order by conname;
