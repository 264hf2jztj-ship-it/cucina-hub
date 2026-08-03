begin;

create sequence if not exists public.course_content_code_seq;

alter table public.course_contents
  add column if not exists content_code text;

update public.course_contents
set content_code = 'CNT-' || lpad(nextval('public.course_content_code_seq')::text, 6, '0')
where content_code is null;

alter table public.course_contents
  alter column content_code set default ('CNT-' || lpad(nextval('public.course_content_code_seq')::text, 6, '0')),
  alter column content_code set not null;

create unique index if not exists course_contents_content_code_key
  on public.course_contents(content_code);

commit;

select content_code
from public.course_contents
order by created_at desc
limit 5;
