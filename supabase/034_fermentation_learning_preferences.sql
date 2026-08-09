begin;

create table if not exists public.fermentation_learning_preferences (
  owner_user_id uuid primary key default auth.uid(),
  enabled boolean not null default true,
  minimum_sessions smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fermentation_learning_preferences_minimum_valid
    check (minimum_sessions between 2 and 20)
);

alter table public.fermentation_learning_preferences enable row level security;

drop policy if exists fermentation_learning_preferences_owner_select
on public.fermentation_learning_preferences;
create policy fermentation_learning_preferences_owner_select
on public.fermentation_learning_preferences
for select
using (owner_user_id = auth.uid());

drop policy if exists fermentation_learning_preferences_owner_insert
on public.fermentation_learning_preferences;
create policy fermentation_learning_preferences_owner_insert
on public.fermentation_learning_preferences
for insert
with check (owner_user_id = auth.uid());

drop policy if exists fermentation_learning_preferences_owner_update
on public.fermentation_learning_preferences;
create policy fermentation_learning_preferences_owner_update
on public.fermentation_learning_preferences
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists fermentation_learning_preferences_owner_delete
on public.fermentation_learning_preferences;
create policy fermentation_learning_preferences_owner_delete
on public.fermentation_learning_preferences
for delete
using (owner_user_id = auth.uid());

grant select, insert, update, delete
on public.fermentation_learning_preferences
to authenticated;

commit;

select
  to_regclass('public.fermentation_learning_preferences') as fermentation_learning_preferences,
  exists (
    select 1
    from pg_constraint
    where conname = 'fermentation_learning_preferences_minimum_valid'
  ) as minimum_constraint_present,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fermentation_learning_preferences'
  ) as rls_policy_count;
