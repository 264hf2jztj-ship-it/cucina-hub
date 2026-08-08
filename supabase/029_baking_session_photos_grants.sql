begin;

grant select, insert, update, delete
on table public.baking_session_photos
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

commit;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'baking_session_photos'
  and grantee = 'authenticated'
order by privilege_type;
