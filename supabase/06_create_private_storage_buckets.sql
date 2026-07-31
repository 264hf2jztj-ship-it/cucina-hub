-- Cucina Hub — Macrostep 6.2
-- Crea o riallinea i quattro bucket privati previsti dal progetto.
-- Script idempotente: può essere rilanciato senza duplicare i bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'recipe-images',
    'recipe-images',
    false,
    10485760,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  ),
  (
    'appliance-images',
    'appliance-images',
    false,
    10485760,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  ),
  (
    'manuals',
    'manuals',
    false,
    52428800,
    array['application/pdf']
  ),
  (
    'course-assets',
    'course-assets',
    false,
    52428800,
    array[
      'application/pdf',
      'image/jpeg','image/png','image/webp','image/heic','image/heif',
      'video/mp4','video/quicktime'
    ]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Verifica finale: devono risultare quattro righe, tutte con public = false.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('recipe-images','appliance-images','manuals','course-assets')
order by id;
