begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-images',
  'session-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.baking_session_photos (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.baking_sessions(id) on delete cascade,
  phase_id text,
  activity_id text,
  label text not null default 'Foto sessione',
  storage_bucket text not null default 'session-images',
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists baking_session_photos_session_idx
  on public.baking_session_photos(session_id, created_at);

create unique index if not exists baking_session_photos_one_cover_idx
  on public.baking_session_photos(session_id)
  where is_cover;

alter table public.baking_session_photos enable row level security;

drop policy if exists "baking_session_photos_select_own" on public.baking_session_photos;
create policy "baking_session_photos_select_own"
on public.baking_session_photos for select
using (owner_user_id = auth.uid());

drop policy if exists "baking_session_photos_insert_own" on public.baking_session_photos;
create policy "baking_session_photos_insert_own"
on public.baking_session_photos for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.baking_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "baking_session_photos_update_own" on public.baking_session_photos;
create policy "baking_session_photos_update_own"
on public.baking_session_photos for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "baking_session_photos_delete_own" on public.baking_session_photos;
create policy "baking_session_photos_delete_own"
on public.baking_session_photos for delete
using (owner_user_id = auth.uid());

drop policy if exists "session_images_select_own" on storage.objects;
create policy "session_images_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'session-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "session_images_insert_own" on storage.objects;
create policy "session_images_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'session-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "session_images_update_own" on storage.objects;
create policy "session_images_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'session-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'session-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "session_images_delete_own" on storage.objects;
create policy "session_images_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'session-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

select id, name, public, file_size_limit
from storage.buckets
where id = 'session-images';

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'baking_session_photos'
order by ordinal_position;