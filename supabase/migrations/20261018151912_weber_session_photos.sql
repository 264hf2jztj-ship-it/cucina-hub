begin;

create table public.weber_session_photos (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  session_id uuid not null references public.weber_cook_sessions(id) on delete restrict,
  storage_file_id uuid not null unique references public.storage_files(id) on delete restrict,
  photo_kind text not null check (photo_kind in ('setup','cooking','result')),
  caption text check (char_length(caption) <= 1000),
  created_at timestamptz not null default now()
);
create index weber_photos_owner_session_idx on public.weber_session_photos(owner_user_id, session_id, created_at);
create index weber_photos_session_idx on public.weber_session_photos(session_id);
alter table public.weber_session_photos enable row level security;
revoke all on public.weber_session_photos from anon, authenticated;
grant select, insert, delete on public.weber_session_photos to authenticated;
grant update (photo_kind, caption) on public.weber_session_photos to authenticated;

create policy weber_photos_select on public.weber_session_photos for select to authenticated
using ((select auth.uid()) = owner_user_id);
create policy weber_photos_insert on public.weber_session_photos for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and exists (select 1 from public.weber_cook_sessions s where s.id = weber_session_photos.session_id and s.owner_user_id = (select auth.uid()))
  and exists (select 1 from public.storage_files f
    where f.id = weber_session_photos.storage_file_id and f.owner_user_id = (select auth.uid())
      and f.bucket_name = 'recipe-images' and f.status = 'ready'
      and f.object_path like (weber_session_photos.owner_user_id::text || '/weber/' || weber_session_photos.session_id::text || '/photos/%')
      and f.mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
      and f.size_bytes between 1 and 10485760)
);
create policy weber_photos_update on public.weber_session_photos for update to authenticated
using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy weber_photos_delete on public.weber_session_photos for delete to authenticated
using ((select auth.uid()) = owner_user_id);

-- Atomic DB registration after successful Storage upload; no privileged bypass.
create function public.register_weber_photo(
  p_file_id uuid, p_session_id uuid, p_photo_kind text, p_caption text,
  p_mime_type text, p_size_bytes bigint, p_original_filename text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_extension text;
  v_path text;
  v_existing public.weber_session_photos;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists (select 1 from public.weber_cook_sessions where id=p_session_id and owner_user_id=v_owner) then
    raise exception 'Session not available' using errcode='42501';
  end if;
  v_extension := case p_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' end;
  if v_extension is null or p_size_bytes is null or p_size_bytes not between 1 and 10485760 then
    raise exception 'Invalid image format or size';
  end if;
  v_path := v_owner::text || '/weber/' || p_session_id::text || '/photos/' || p_file_id::text || '.' || v_extension;
  select * into v_existing from public.weber_session_photos where id=p_file_id and owner_user_id=v_owner;
  if found then
    if v_existing.session_id <> p_session_id then raise exception 'Photo identity conflict'; end if;
    return v_existing.id;
  end if;
  insert into public.storage_files(id,owner_user_id,bucket_name,object_path,original_filename,mime_type,size_bytes,status)
  values(p_file_id,v_owner,'recipe-images',v_path,nullif(btrim(p_original_filename),''),p_mime_type,p_size_bytes,'ready');
  insert into public.weber_session_photos(id,owner_user_id,session_id,storage_file_id,photo_kind,caption)
  values(p_file_id,v_owner,p_session_id,p_file_id,p_photo_kind,nullif(btrim(p_caption),''));
  return p_file_id;
end $$;

-- Called only after Storage removal. A failed DB cleanup leaves the link available for retry.
create function public.unregister_weber_photo(p_photo_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_file uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select storage_file_id into v_file from public.weber_session_photos
  where id=p_photo_id and owner_user_id=(select auth.uid()) for update;
  if not found then return; end if;
  delete from public.weber_session_photos where id=p_photo_id and owner_user_id=(select auth.uid());
  delete from public.storage_files where id=v_file and owner_user_id=(select auth.uid());
  if not found then raise exception 'File registry cleanup failed'; end if;
end $$;
revoke all on function public.register_weber_photo(uuid,uuid,text,text,text,bigint,text) from public, anon;
revoke all on function public.unregister_weber_photo(uuid) from public, anon;
grant execute on function public.register_weber_photo(uuid,uuid,text,text,text,bigint,text) to authenticated;
grant execute on function public.unregister_weber_photo(uuid) to authenticated;

comment on table public.weber_session_photos is 'Foto private Weber collegate al registro storage_files. Eliminare prima le foto, poi la sessione, per evitare file orfani.';
commit;
