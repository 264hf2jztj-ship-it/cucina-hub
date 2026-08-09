begin;

alter table public.baking_session_evaluations
  add column if not exists include_in_learning boolean not null default true;

comment on column public.baking_session_evaluations.include_in_learning is
  'Controls whether this evaluation is included in fermentation Learning analyses. Exclusion does not delete the session or evaluation.';

create index if not exists baking_session_evaluations_learning_idx
on public.baking_session_evaluations(owner_user_id, include_in_learning, updated_at desc);

commit;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'baking_session_evaluations'
  and column_name = 'include_in_learning';
