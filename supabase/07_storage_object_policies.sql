-- Cucina Hub — Macrostep 6.3
-- Policy RLS per i quattro bucket privati.
-- Ogni oggetto deve avere auth.uid() come primo segmento del percorso.

begin;

-- Mantiene la migrazione idempotente.
drop policy if exists "cucina_hub_storage_select_own" on storage.objects;
drop policy if exists "cucina_hub_storage_insert_own" on storage.objects;
drop policy if exists "cucina_hub_storage_update_own" on storage.objects;
drop policy if exists "cucina_hub_storage_delete_own" on storage.objects;

create policy "cucina_hub_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('recipe-images', 'appliance-images', 'manuals', 'course-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "cucina_hub_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('recipe-images', 'appliance-images', 'manuals', 'course-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "cucina_hub_storage_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('recipe-images', 'appliance-images', 'manuals', 'course-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('recipe-images', 'appliance-images', 'manuals', 'course-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "cucina_hub_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('recipe-images', 'appliance-images', 'manuals', 'course-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

-- Verifica finale: devono risultare quattro righe.
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'cucina_hub_storage_%'
order by policyname;