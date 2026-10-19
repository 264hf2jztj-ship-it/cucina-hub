-- SQL Editor / postgres. Uses the configured administrator without exporting personal data.
-- The synthetic session, registry record and photo are rolled back in the inner subtransaction.
do $test$
declare
  v_owner uuid;
  v_session uuid := gen_random_uuid();
  v_photo uuid := gen_random_uuid();
begin
  select id into v_owner from public.profiles where role='admin' limit 1;
  if v_owner is null then raise exception 'No administrator available for test'; end if;
  begin
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    execute 'set local role authenticated';
    insert into public.weber_cook_sessions(id,title,cooked_at,cooking_method,fuel_type)
    values(v_session,'__weber_photo_rollback__',now(),'indirect','briquettes');
    perform public.register_weber_photo(v_photo,v_session,'setup','Test','image/jpeg',512,'test.jpg');
    if not exists(select 1 from public.weber_session_photos where id=v_photo) then raise exception 'Owner read failed'; end if;
    if not exists(select 1 from public.storage_files where id=v_photo and owner_user_id=v_owner and status='ready') then raise exception 'Registry missing'; end if;
    -- A repeated registration returns the same identity and does not duplicate the file.
    perform public.register_weber_photo(v_photo,v_session,'setup','Test','image/jpeg',512,'test.jpg');
    begin
      delete from public.weber_cook_sessions where id=v_session;
      raise exception 'Session with photos was deleted';
    exception when foreign_key_violation then null; end;
    update public.weber_session_photos set caption='Updated',photo_kind='result' where id=v_photo;
    if not found then raise exception 'Owner metadata update failed'; end if;
    begin
      update public.weber_session_photos set owner_user_id=gen_random_uuid() where id=v_photo;
      raise exception 'Photo reassignment allowed';
    exception when insufficient_privilege then null; end;
    -- Invalid metadata must roll back both photo and registry insertion.
    declare v_bad uuid := gen_random_uuid(); begin
      begin
        perform public.register_weber_photo(v_bad,v_session,'invalid','Test','image/jpeg',512,'test.jpg');
        raise exception 'Invalid phase accepted';
      exception when check_violation then null; end;
      if exists(select 1 from public.storage_files where id=v_bad) then raise exception 'Non-atomic registration'; end if;
    end;
    perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
    if exists(select 1 from public.weber_session_photos where id=v_photo) then raise exception 'Cross-owner read allowed'; end if;
    update public.weber_session_photos set caption='Forbidden' where id=v_photo;
    if found then raise exception 'Cross-owner update allowed'; end if;
    delete from public.weber_session_photos where id=v_photo;
    if found then raise exception 'Cross-owner delete allowed'; end if;
    begin
      perform public.register_weber_photo(gen_random_uuid(),v_session,'setup','Test','image/jpeg',512,'test.jpg');
      raise exception 'Cross-owner registration allowed';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    perform public.unregister_weber_photo(v_photo);
    if exists(select 1 from public.weber_session_photos where id=v_photo) or exists(select 1 from public.storage_files where id=v_photo) then raise exception 'Cleanup failed'; end if;
    perform public.unregister_weber_photo(v_photo); -- safe retry
    delete from public.weber_cook_sessions where id=v_session;
    if not found then raise exception 'Empty session delete failed'; end if;
    raise exception using errcode='ZX001', message='Rollback successful test';
  exception when sqlstate 'ZX001' then null;
  end;
end $test$;
