begin;

alter table public.baking_sessions
  add column if not exists cooking_method text not null default 'bake',
  add column if not exists cooking_profile jsonb not null default '{}'::jsonb,
  add column if not exists oil_weight_g numeric(8,2),
  add column if not exists sugar_weight_g numeric(8,2);

alter table public.baking_sessions
  drop constraint if exists baking_sessions_oven_type_allowed;

alter table public.baking_sessions
  add constraint baking_sessions_oven_type_allowed
  check (
    oven_type is null
    or oven_type in (
      'samsung_oven',
      'weber_kettle',
      'air_fryer',
      'induction_deep_fry',
      'other'
    )
  );

alter table public.baking_sessions
  drop constraint if exists baking_sessions_cooking_method_allowed;

alter table public.baking_sessions
  add constraint baking_sessions_cooking_method_allowed
  check (cooking_method in ('bake','deep_fry'));

alter table public.baking_sessions
  drop constraint if exists baking_sessions_cooking_profile_object;

alter table public.baking_sessions
  add constraint baking_sessions_cooking_profile_object
  check (jsonb_typeof(cooking_profile) = 'object');

alter table public.baking_sessions
  drop constraint if exists baking_sessions_oil_weight_valid;

alter table public.baking_sessions
  add constraint baking_sessions_oil_weight_valid
  check (oil_weight_g is null or oil_weight_g >= 0);

alter table public.baking_sessions
  drop constraint if exists baking_sessions_sugar_weight_valid;

alter table public.baking_sessions
  add constraint baking_sessions_sugar_weight_valid
  check (sugar_weight_g is null or sugar_weight_g >= 0);

create index if not exists baking_sessions_owner_cooking_method_idx
on public.baking_sessions(owner_user_id, cooking_method, target_meal_at desc);

commit;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'baking_sessions'
  and column_name in ('cooking_method','cooking_profile','oil_weight_g','sugar_weight_g')
order by column_name;
