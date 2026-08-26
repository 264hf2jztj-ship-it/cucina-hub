begin;
create extension if not exists pgcrypto;
create table if not exists public.recipe_experiments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  baking_session_id uuid references public.baking_sessions(id) on delete set null,
  title text not null,
  hypothesis text not null,
  variable_name text not null,
  change_description text not null,
  expected_outcome text,
  result_notes text,
  status text not null default 'planned',
  outcome text,
  rating smallint,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_experiments_title_valid check (char_length(btrim(title)) between 1 and 180),
  constraint recipe_experiments_hypothesis_valid check (char_length(btrim(hypothesis)) between 1 and 2000),
  constraint recipe_experiments_variable_valid check (char_length(btrim(variable_name)) between 1 and 160),
  constraint recipe_experiments_change_valid check (char_length(btrim(change_description)) between 1 and 3000),
  constraint recipe_experiments_expected_valid check (expected_outcome is null or char_length(expected_outcome) <= 2000),
  constraint recipe_experiments_result_valid check (result_notes is null or char_length(result_notes) <= 4000),
  constraint recipe_experiments_status_allowed check (status in ('planned','running','completed','cancelled')),
  constraint recipe_experiments_outcome_allowed check (outcome is null or outcome in ('improved','unchanged','worse','inconclusive')),
  constraint recipe_experiments_rating_valid check (rating is null or rating between 1 and 5),
  constraint recipe_experiments_completion_valid check ((status = 'completed' and outcome is not null and completed_at is not null) or (status <> 'completed' and completed_at is null))
);
comment on table public.recipe_experiments is 'Esperimenti personali collegati a una ricetta e, facoltativamente, a una sessione di Laboratorio. Non modificano la ricetta sorgente.';
create index if not exists recipe_experiments_owner_updated_idx on public.recipe_experiments(owner_user_id, updated_at desc);
create index if not exists recipe_experiments_owner_recipe_idx on public.recipe_experiments(owner_user_id, recipe_id, created_at desc);
create index if not exists recipe_experiments_recipe_fk_idx on public.recipe_experiments(recipe_id);
create index if not exists recipe_experiments_session_fk_idx on public.recipe_experiments(baking_session_id) where baking_session_id is not null;
alter table public.recipe_experiments enable row level security;
revoke all on table public.recipe_experiments from anon, authenticated;
grant select, insert, update, delete on table public.recipe_experiments to authenticated;
drop policy if exists recipe_experiments_owner_select on public.recipe_experiments;
create policy recipe_experiments_owner_select on public.recipe_experiments for select to authenticated using ((select auth.uid()) = owner_user_id);
drop policy if exists recipe_experiments_owner_insert on public.recipe_experiments;
create policy recipe_experiments_owner_insert on public.recipe_experiments for insert to authenticated with check (
  (select auth.uid()) = owner_user_id
  and exists (select 1 from public.recipes recipe where recipe.id = recipe_id and recipe.owner_user_id = (select auth.uid()))
  and (baking_session_id is null or exists (select 1 from public.baking_sessions session where session.id = baking_session_id and session.owner_user_id = (select auth.uid())))
);
drop policy if exists recipe_experiments_owner_update on public.recipe_experiments;
create policy recipe_experiments_owner_update on public.recipe_experiments for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (select 1 from public.recipes recipe where recipe.id = recipe_id and recipe.owner_user_id = (select auth.uid()))
  and (baking_session_id is null or exists (select 1 from public.baking_sessions session where session.id = baking_session_id and session.owner_user_id = (select auth.uid())))
);
drop policy if exists recipe_experiments_owner_delete on public.recipe_experiments;
create policy recipe_experiments_owner_delete on public.recipe_experiments for delete to authenticated using ((select auth.uid()) = owner_user_id);
commit;
