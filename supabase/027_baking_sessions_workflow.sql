begin;

alter table public.baking_sessions
  add column if not exists workflow_definition jsonb,
  add column if not exists workflow_runtime jsonb,
  add column if not exists guidance_mode text not null default 'beginner';

alter table public.baking_sessions
  drop constraint if exists baking_sessions_guidance_mode_allowed;

alter table public.baking_sessions
  add constraint baking_sessions_guidance_mode_allowed
  check (guidance_mode in ('beginner','expert'));

commit;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'baking_sessions'
  and column_name in ('workflow_definition','workflow_runtime','guidance_mode')
order by column_name;
