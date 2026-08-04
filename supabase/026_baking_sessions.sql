begin;

create extension if not exists pgcrypto;

create table if not exists public.baking_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  dough_profile_id uuid references public.fermentation_dough_profiles(id) on delete set null,
  environment_profile_id uuid references public.fermentation_environment_profiles(id) on delete set null,
  title text not null,
  product_style text not null,
  status text not null default 'draft',
  flour_name text,
  flour_weight_g numeric(8,2) not null,
  yeast_type text not null,
  target_meal_at timestamptz not null,
  hydration_percent numeric(6,3),
  water_weight_g numeric(8,2),
  salt_weight_g numeric(8,2),
  yeast_weight_g numeric(8,3),
  bulk_fermentation_minutes integer,
  cold_fermentation_minutes integer,
  final_proof_minutes integer,
  target_dough_temperature_c numeric(4,1),
  oven_type text,
  oven_temperature_c integer,
  generated_plan jsonb not null default '[]'::jsonb,
  rating smallint,
  result_notes text,
  learning_notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint baking_sessions_title_not_blank check (btrim(title) <> ''),
  constraint baking_sessions_style_not_blank check (btrim(product_style) <> ''),
  constraint baking_sessions_status_allowed check (status in ('draft','planned','active','completed','cancelled')),
  constraint baking_sessions_flour_valid check (flour_weight_g > 0),
  constraint baking_sessions_rating_valid check (rating is null or rating between 1 and 5),
  constraint baking_sessions_oven_type_allowed check (oven_type is null or oven_type in ('samsung_oven','weber_kettle','air_fryer','other'))
);

create index if not exists baking_sessions_owner_target_idx
on public.baking_sessions(owner_user_id, target_meal_at desc);

alter table public.baking_sessions enable row level security;

drop policy if exists baking_sessions_owner_all on public.baking_sessions;
create policy baking_sessions_owner_all
on public.baking_sessions
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

grant select, insert, update, delete on public.baking_sessions to authenticated;

commit;

select to_regclass('public.baking_sessions') as baking_sessions;
