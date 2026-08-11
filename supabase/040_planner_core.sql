begin;

create extension if not exists pgcrypto;

create table if not exists public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  planned_date date not null,
  meal_slot text not null,
  planned_time time without time zone,
  servings smallint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_meals_slot_allowed check (
    meal_slot in (
      'breakfast',
      'morning_snack',
      'lunch',
      'afternoon_snack',
      'dinner',
      'other'
    )
  ),
  constraint planned_meals_servings_range check (
    servings is null or servings between 1 and 50
  ),
  constraint planned_meals_note_length check (
    note is null or char_length(note) <= 1000
  )
);

create index if not exists planned_meals_owner_schedule_idx
on public.planned_meals(owner_user_id, planned_date, meal_slot, planned_time);

create index if not exists planned_meals_owner_recipe_idx
on public.planned_meals(owner_user_id, recipe_id, planned_date);

create unique index if not exists planned_meals_owner_schedule_recipe_key
on public.planned_meals(
  owner_user_id,
  planned_date,
  meal_slot,
  coalesce(planned_time, time '00:00'),
  recipe_id
);

alter table public.planned_meals enable row level security;

drop policy if exists planned_meals_owner_select on public.planned_meals;
create policy planned_meals_owner_select
on public.planned_meals
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_id
      and recipe.owner_user_id = auth.uid()
  )
);

drop policy if exists planned_meals_owner_insert on public.planned_meals;
create policy planned_meals_owner_insert
on public.planned_meals
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_id
      and recipe.owner_user_id = auth.uid()
  )
);

drop policy if exists planned_meals_owner_update on public.planned_meals;
create policy planned_meals_owner_update
on public.planned_meals
for update
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_id
      and recipe.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_id
      and recipe.owner_user_id = auth.uid()
  )
);

drop policy if exists planned_meals_owner_delete on public.planned_meals;
create policy planned_meals_owner_delete
on public.planned_meals
for delete
using (owner_user_id = auth.uid());

grant select, insert, update, delete on public.planned_meals to authenticated;

comment on table public.planned_meals is
  'Pasti pianificati personali che referenziano ricette della Biblioteca senza copiarne i contenuti.';

comment on column public.planned_meals.planned_date is
  'Data locale del pasto, indipendente dal fuso orario; l orario e facoltativo.';

commit;

select
  to_regclass('public.planned_meals') as planned_meals,
  exists (
    select 1
    from pg_constraint
    where conname = 'planned_meals_recipe_id_fkey'
      and conrelid = 'public.planned_meals'::regclass
  ) as recipe_foreign_key,
  exists (
    select 1
    from pg_constraint
    where conname = 'planned_meals_slot_allowed'
      and conrelid = 'public.planned_meals'::regclass
  ) as slot_constraint,
  to_regclass('public.planned_meals_owner_schedule_idx') is not null
    as schedule_index,
  to_regclass('public.planned_meals_owner_schedule_recipe_key') is not null
    as duplicate_guard,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.planned_meals'::regclass
  ) as rls_enabled,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planned_meals'
  ) as policy_count;
