begin;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.course_categories to authenticated;
grant select, insert, update, delete on table public.course_contents to authenticated;
grant select, insert, update, delete on table public.course_content_files to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter table public.course_categories enable row level security;
alter table public.course_contents enable row level security;
alter table public.course_content_files enable row level security;

drop policy if exists course_categories_owner_all on public.course_categories;
create policy course_categories_owner_all
on public.course_categories
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists course_contents_owner_all on public.course_contents;
create policy course_contents_owner_all
on public.course_contents
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists course_content_files_owner_all on public.course_content_files;
create policy course_content_files_owner_all
on public.course_content_files
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

commit;

select
  table_name,
  privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in ('course_categories','course_contents','course_content_files')
order by table_name, privilege_type;
