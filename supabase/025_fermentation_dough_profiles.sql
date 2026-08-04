begin;

create extension if not exists pgcrypto;

create table if not exists public.fermentation_dough_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  environment_profile_id uuid references public.fermentation_environment_profiles(id) on delete set null,
  name text not null,
  dough_type text not null default 'other',
  description text,
  is_default boolean not null default false,

  flour_weight_g numeric(8,2) not null default 1000,
  target_hydration_percent numeric(6,3) not null default 65,
  target_dough_temperature_c numeric(4,1),

  yeast_type text not null default 'fresh_yeast',
  yeast_baker_percent numeric(7,4),
  preferment_type text not null default 'none',
  preferment_flour_percent numeric(6,3) not null default 0,

  bulk_fermentation_minutes integer not null default 0,
  bulk_fermentation_temperature_c numeric(4,1),
  cold_fermentation_minutes integer not null default 0,
  fridge_temperature_c numeric(4,1),
  final_proof_minutes integer not null default 0,
  final_proof_temperature_c numeric(4,1),

  target_ready_time time,
  target_ready_day_offset integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fermentation_dough_profiles_name_not_blank check (btrim(name) <> ''),
  constraint fermentation_dough_profiles_dough_type_allowed check (
    dough_type in ('pizza','bread','focaccia','flatbread','sweet_dough','fresh_pasta','other')
  ),
  constraint fermentation_dough_profiles_flour_weight_valid check (flour_weight_g > 0 and flour_weight_g <= 100000),
  constraint fermentation_dough_profiles_hydration_valid check (target_hydration_percent between 0 and 200),
  constraint fermentation_dough_profiles_target_temperature_valid check (
    target_dough_temperature_c is null or target_dough_temperature_c between 0 and 45
  ),
  constraint fermentation_dough_profiles_yeast_type_allowed check (
    yeast_type in ('fresh_yeast','dry_yeast','sourdough','none','other')
  ),
  constraint fermentation_dough_profiles_yeast_percent_valid check (
    yeast_baker_percent is null or yeast_baker_percent between 0 and 100
  ),
  constraint fermentation_dough_profiles_preferment_type_allowed check (
    preferment_type in ('none','poolish','biga','sourdough','pate_fermentee','other')
  ),
  constraint fermentation_dough_profiles_preferment_percent_valid check (
    preferment_flour_percent between 0 and 100
  ),
  constraint fermentation_dough_profiles_bulk_minutes_valid check (bulk_fermentation_minutes between 0 and 100800),
  constraint fermentation_dough_profiles_cold_minutes_valid check (cold_fermentation_minutes between 0 and 100800),
  constraint fermentation_dough_profiles_final_proof_minutes_valid check (final_proof_minutes between 0 and 100800),
  constraint fermentation_dough_profiles_bulk_temperature_valid check (
    bulk_fermentation_temperature_c is null or bulk_fermentation_temperature_c between -5 and 45
  ),
  constraint fermentation_dough_profiles_fridge_temperature_valid check (
    fridge_temperature_c is null or fridge_temperature_c between -5 and 20
  ),
  constraint fermentation_dough_profiles_final_proof_temperature_valid check (
    final_proof_temperature_c is null or final_proof_temperature_c between -5 and 45
  ),
  constraint fermentation_dough_profiles_target_day_offset_valid check (target_ready_day_offset between 0 and 30),
  constraint fermentation_dough_profiles_owner_name_key unique (owner_user_id, name)
);

create unique index if not exists fermentation_dough_profiles_one_default_idx
on public.fermentation_dough_profiles(owner_user_id)
where is_default;

create index if not exists fermentation_dough_profiles_owner_idx
on public.fermentation_dough_profiles(owner_user_id, name);

create index if not exists fermentation_dough_profiles_environment_idx
on public.fermentation_dough_profiles(environment_profile_id);

create table if not exists public.fermentation_dough_profile_ingredients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fermentation_dough_profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid(),
  ingredient_name text not null,
  ingredient_role text not null default 'other',
  amount numeric(10,3),
  unit text,
  baker_percent numeric(8,4),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fermentation_dough_profile_ingredients_name_not_blank check (btrim(ingredient_name) <> ''),
  constraint fermentation_dough_profile_ingredients_role_allowed check (
    ingredient_role in ('flour','water','salt','yeast','sourdough','oil','fat','sugar','malt','preferment','other')
  ),
  constraint fermentation_dough_profile_ingredients_amount_valid check (amount is null or amount >= 0),
  constraint fermentation_dough_profile_ingredients_unit_not_blank check (unit is null or btrim(unit) <> ''),
  constraint fermentation_dough_profile_ingredients_baker_percent_valid check (
    baker_percent is null or baker_percent between 0 and 1000
  ),
  constraint fermentation_dough_profile_ingredients_sort_order_valid check (sort_order >= 0),
  constraint fermentation_dough_profile_ingredients_owner_profile_name_key unique (owner_user_id, profile_id, ingredient_name)
);

create index if not exists fermentation_dough_profile_ingredients_profile_idx
on public.fermentation_dough_profile_ingredients(profile_id, sort_order);

create table if not exists public.fermentation_dough_profile_steps (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fermentation_dough_profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid(),
  phase text not null default 'mixing',
  title text not null,
  instructions text,
  duration_minutes integer,
  target_temperature_c numeric(4,1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fermentation_dough_profile_steps_title_not_blank check (btrim(title) <> ''),
  constraint fermentation_dough_profile_steps_phase_allowed check (
    phase in ('mise_en_place','preferment','mixing','rest','fold','bulk','division','shaping','cold_fermentation','final_proof','baking','cooling','other')
  ),
  constraint fermentation_dough_profile_steps_duration_valid check (
    duration_minutes is null or duration_minutes between 0 and 100800
  ),
  constraint fermentation_dough_profile_steps_temperature_valid check (
    target_temperature_c is null or target_temperature_c between -5 and 300
  ),
  constraint fermentation_dough_profile_steps_sort_order_valid check (sort_order >= 0),
  constraint fermentation_dough_profile_steps_owner_profile_order_key unique (owner_user_id, profile_id, sort_order)
);

create index if not exists fermentation_dough_profile_steps_profile_idx
on public.fermentation_dough_profile_steps(profile_id, sort_order);

alter table public.fermentation_dough_profiles enable row level security;
alter table public.fermentation_dough_profile_ingredients enable row level security;
alter table public.fermentation_dough_profile_steps enable row level security;

drop policy if exists fermentation_dough_profiles_owner_all on public.fermentation_dough_profiles;
create policy fermentation_dough_profiles_owner_all
on public.fermentation_dough_profiles
for all
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and (
    environment_profile_id is null
    or exists (
      select 1
      from public.fermentation_environment_profiles environment_profile
      where environment_profile.id = environment_profile_id
        and environment_profile.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists fermentation_dough_profile_ingredients_owner_all on public.fermentation_dough_profile_ingredients;
create policy fermentation_dough_profile_ingredients_owner_all
on public.fermentation_dough_profile_ingredients
for all
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.fermentation_dough_profiles profile
    where profile.id = profile_id
      and profile.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.fermentation_dough_profiles profile
    where profile.id = profile_id
      and profile.owner_user_id = auth.uid()
  )
);

drop policy if exists fermentation_dough_profile_steps_owner_all on public.fermentation_dough_profile_steps;
create policy fermentation_dough_profile_steps_owner_all
on public.fermentation_dough_profile_steps
for all
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.fermentation_dough_profiles profile
    where profile.id = profile_id
      and profile.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.fermentation_dough_profiles profile
    where profile.id = profile_id
      and profile.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete
on public.fermentation_dough_profiles,
   public.fermentation_dough_profile_ingredients,
   public.fermentation_dough_profile_steps
to authenticated;

commit;

select
  to_regclass('public.fermentation_dough_profiles') as fermentation_dough_profiles,
  to_regclass('public.fermentation_dough_profile_ingredients') as fermentation_dough_profile_ingredients,
  to_regclass('public.fermentation_dough_profile_steps') as fermentation_dough_profile_steps;
