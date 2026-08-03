-- 020_storage_files_course_assets.sql
-- Consente la registrazione dei file del bucket privato course-assets in storage_files.
-- Migrazione idempotente: può essere eseguita più volte.

do $$
declare
  bucket_column text;
begin
  select c.column_name
    into bucket_column
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'storage_files'
    and c.column_name in ('bucket_name', 'bucket_id', 'bucket')
  order by case c.column_name
    when 'bucket_name' then 1
    when 'bucket_id' then 2
    else 3
  end
  limit 1;

  if bucket_column is null then
    raise exception 'Nessuna colonna bucket compatibile trovata in public.storage_files';
  end if;

  alter table public.storage_files
    drop constraint if exists storage_files_bucket_allowed;

  execute format(
    'alter table public.storage_files add constraint storage_files_bucket_allowed check (%I in (''recipe-images'', ''appliance-images'', ''manuals'', ''course-assets''))',
    bucket_column
  );
end
$$;

-- Verifica finale: mostra il vincolo effettivamente installato.
select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.storage_files'::regclass
  and conname = 'storage_files_bucket_allowed';
