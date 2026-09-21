begin;

create extension if not exists pgcrypto;

create table if not exists public.weber_cook_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  title text not null,
  cooked_at timestamptz not null,
  status text not null default 'planned',
  cooking_method text not null,
  fuel_type text not null,
  fuel_amount numeric(8,2),
  fuel_unit text,
  ignition_method text,
  vent_bottom_percent smallint,
  vent_top_percent smallint,
  target_grate_temp_c smallint,
  peak_grate_temp_c smallint,
  food_core_temp_c numeric(4,1),
  duration_minutes integer,
  rating smallint,
  result_notes text,
  next_change text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weber_cook_sessions_title_valid check (char_length(btrim(title)) between 1 and 180),
  constraint weber_cook_sessions_status_allowed check (status in ('planned', 'active', 'completed', 'cancelled')),
  constraint weber_cook_sessions_method_allowed check (cooking_method in ('direct', 'indirect', 'two_zone', 'snake')),
  constraint weber_cook_sessions_fuel_allowed check (fuel_type in ('briquettes', 'charcoal', 'mixed', 'other')),
  constraint weber_cook_sessions_fuel_amount_valid check (fuel_amount is null or fuel_amount > 0),
  constraint weber_cook_sessions_fuel_unit_allowed check (fuel_unit is null or fuel_unit in ('pieces', 'g', 'kg', 'chimney')),
  constraint weber_cook_sessions_fuel_pair_valid check ((fuel_amount is null) = (fuel_unit is null)),
  constraint weber_cook_sessions_vent_bottom_valid check (vent_bottom_percent is null or vent_bottom_percent between 0 and 100),
  constraint weber_cook_sessions_vent_top_valid check (vent_top_percent is null or vent_top_percent between 0 and 100),
  constraint weber_cook_sessions_target_temp_valid check (target_grate_temp_c is null or target_grate_temp_c between 40 and 450),
  constraint weber_cook_sessions_peak_temp_valid check (peak_grate_temp_c is null or peak_grate_temp_c between 40 and 450),
  constraint weber_cook_sessions_core_temp_valid check (food_core_temp_c is null or food_core_temp_c between 0 and 150),
  constraint weber_cook_sessions_duration_valid check (duration_minutes is null or duration_minutes > 0),
  constraint weber_cook_sessions_rating_valid check (rating is null or rating between 1 and 5),
  constraint weber_cook_sessions_result_valid check (result_notes is null or char_length(result_notes) <= 4000),
  constraint weber_cook_sessions_next_change_valid check (next_change is null or char_length(next_change) <= 2000)
);

comment on table public.weber_cook_sessions is 'Diario tecnico personale delle cotture Weber Kettle. Registra il setup realmente usato senza sostituire ricette o esperimenti.';

create index if not exists weber_cook_sessions_owner_cooked_idx
on public.weber_cook_sessions(owner_user_id, cooked_at desc);

create index if not exists weber_cook_sessions_recipe_fk_idx
on public.weber_cook_sessions(recipe_id)
where recipe_id is not null;

alter table public.weber_cook_sessions enable row level security;

revoke all on table public.weber_cook_sessions from anon, authenticated;
grant select, insert, update, delete on table public.weber_cook_sessions to authenticated;

drop policy if exists weber_cook_sessions_owner_select on public.weber_cook_sessions;
create policy weber_cook_sessions_owner_select
on public.weber_cook_sessions for select to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists weber_cook_sessions_owner_insert on public.weber_cook_sessions;
create policy weber_cook_sessions_owner_insert
on public.weber_cook_sessions for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes recipe
      where recipe.id = recipe_id
        and recipe.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists weber_cook_sessions_owner_update on public.weber_cook_sessions;
create policy weber_cook_sessions_owner_update
on public.weber_cook_sessions for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes recipe
      where recipe.id = recipe_id
        and recipe.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists weber_cook_sessions_owner_delete on public.weber_cook_sessions;
create policy weber_cook_sessions_owner_delete
on public.weber_cook_sessions for delete to authenticated
using ((select auth.uid()) = owner_user_id);

commit;

select to_regclass('public.weber_cook_sessions') as weber_cook_sessions;
