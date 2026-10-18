-- Run as postgres in the SQL Editor. All synthetic writes roll back on success or failure.
-- No user IDs or personal data are exported.
begin;
select set_config('test.weber_owner', (select id::text from auth.users order by created_at limit 1), true);
select set_config('test.weber_id', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('test.weber_owner'), true);
set local role authenticated;
insert into public.weber_cook_configurations(id,title,cooking_method,fuel_type)
values(current_setting('test.weber_id')::uuid,'__rollback_test__','indirect','briquettes');
do $$ begin
  if not exists(select 1 from public.weber_cook_configurations where id=current_setting('test.weber_id')::uuid) then raise exception 'Owner read failed'; end if;
  update public.weber_cook_configurations set title='__updated__' where id=current_setting('test.weber_id')::uuid;
  if not found then raise exception 'Owner update failed'; end if;
  begin
    update public.weber_cook_configurations set owner_user_id=gen_random_uuid() where id=current_setting('test.weber_id')::uuid;
    raise exception 'Owner reassignment allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$ begin
  if exists(select 1 from public.weber_cook_configurations where id=current_setting('test.weber_id')::uuid) then raise exception 'Cross-owner read allowed'; end if;
  update public.weber_cook_configurations set title='__denied__' where id=current_setting('test.weber_id')::uuid;
  if found then raise exception 'Cross-owner update allowed'; end if;
  delete from public.weber_cook_configurations where id=current_setting('test.weber_id')::uuid;
  if found then raise exception 'Cross-owner delete allowed'; end if;
  begin
    insert into public.weber_cook_configurations(owner_user_id,title,cooking_method,fuel_type)
    values(current_setting('test.weber_owner')::uuid,'__denied__','direct','charcoal');
    raise exception 'Cross-owner insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.weber_owner'), true);
do $$ begin
  delete from public.weber_cook_configurations where id=current_setting('test.weber_id')::uuid;
  if not found then raise exception 'Owner delete failed'; end if;
end $$;
reset role;
select 'Owner CRUD and cross-owner isolation passed' as verification;
rollback;
