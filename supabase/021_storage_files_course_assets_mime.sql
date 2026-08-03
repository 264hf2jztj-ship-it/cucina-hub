-- 021_storage_files_course_assets_mime.sql
-- Consente la registrazione in storage_files dei PDF e delle immagini
-- caricati nel bucket privato course-assets.
-- Idempotente: il vincolo viene ricreato con lo stesso nome.

do $$
declare
  bucket_col text;
  mime_col text;
begin
  select column_name into bucket_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'storage_files'
    and column_name in ('bucket_name', 'bucket_id', 'bucket')
  order by case column_name
    when 'bucket_name' then 1
    when 'bucket_id' then 2
    else 3
  end
  limit 1;

  select column_name into mime_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'storage_files'
    and column_name in ('mime_type', 'content_type')
  order by case column_name
    when 'mime_type' then 1
    else 2
  end
  limit 1;

  if bucket_col is null then
    raise exception 'Colonna bucket non trovata in public.storage_files';
  end if;

  if mime_col is null then
    raise exception 'Colonna MIME non trovata in public.storage_files';
  end if;

  execute 'alter table public.storage_files drop constraint if exists storage_files_bucket_mime_valid';

  execute format($sql$
    alter table public.storage_files
    add constraint storage_files_bucket_mime_valid
    check (
      (%1$I = 'recipe-images' and %2$I in (
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
      ))
      or
      (%1$I = 'appliance-images' and %2$I in (
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
      ))
      or
      (%1$I = 'manuals' and %2$I = 'application/pdf')
      or
      (%1$I = 'course-assets' and %2$I in (
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
      ))
    )
  $sql$, bucket_col, mime_col);
end $$;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.storage_files'::regclass
  and conname = 'storage_files_bucket_mime_valid';
