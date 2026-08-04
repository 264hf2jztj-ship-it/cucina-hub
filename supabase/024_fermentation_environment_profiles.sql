begin;

create extension if not exists pgcrypto;

create table if not exists public.fermentation_environment_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  name text not null,
  location_label text,
  season text not null default 'custom',
  room_temperature_c numeric(4,1) not null,
  relative_humidity_percent numeric(5,2) not null,
  fridge_temperature_c numeric(4,1),
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fermentation_environment_profiles_name_not_blank check (btrim(name) <> ''),
  constraint fermentation_environment_profiles_season_allowed check (season in ('spring','summer','autumn','winter','custom')),
  constraint fermentation_environment_profiles_room_temperature_valid check (room_temperature_c between 0 and 45),
  constraint fermentation_environment_profiles_humidity_valid check (relative_humidity_percent between 0 and 100),
  constraint fermentation_environment_profiles_fridge_temperature_valid check (fridge_temperature_c is null or fridge_temperature_c between -5 and 20),
  constraint fermentation_environment_profiles_owner_name_key unique (owner_user_id, name)
);

create unique index if not exists fermentation_environment_profiles_one_default_idx
on public.fermentation_environment_profiles(owner_user_id)
where is_default;

create index if not exists fermentation_environment_profiles_owner_idx
on public.fermentation_environment_profiles(owner_user_id, name);

alter table public.fermentation_environment_profiles enable row level security;

drop policy if exists fermentation_environment_profiles_owner_all on public.fermentation_environment_profiles;
create policy fermentation_environment_profiles_owner_all
on public.fermentation_environment_profiles
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

grant select, insert, update, delete
on public.fermentation_environment_profiles
to authenticated;

commit;

select to_regclass('public.fermentation_environment_profiles') as fermentation_environment_profiles;
