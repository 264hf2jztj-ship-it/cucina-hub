begin;

create extension if not exists pgcrypto;

create table if not exists public.flour_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  name text not null,
  brand text,
  product_line text,
  cereal text not null default 'soft_wheat',
  flour_type text not null default '00',
  strength_w numeric(6,1),
  pl_ratio numeric(5,2),
  protein_percent numeric(5,2),
  ash_percent numeric(5,3),
  absorption_percent numeric(6,2),
  falling_number integer,
  milling_method text not null default 'unknown',
  is_malted boolean not null default false,
  contains_improvers boolean not null default false,
  recommended_uses text[] not null default '{}'::text[],
  package_notes text,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint flour_profiles_name_not_blank check (btrim(name) <> ''),
  constraint flour_profiles_brand_not_blank check (brand is null or btrim(brand) <> ''),
  constraint flour_profiles_product_line_not_blank check (product_line is null or btrim(product_line) <> ''),
  constraint flour_profiles_cereal_allowed check (
    cereal in (
      'soft_wheat','durum_wheat','spelt','rye','corn','rice','buckwheat',
      'oat','barley','mixed_cereals','gluten_free_mix','other'
    )
  ),
  constraint flour_profiles_type_allowed check (
    flour_type in (
      '00','0','1','2','wholemeal','manitoba','semola','semola_rimacinata',
      'farro','segale','multicereale','gluten_free','other'
    )
  ),
  constraint flour_profiles_strength_valid check (strength_w is null or strength_w between 50 and 600),
  constraint flour_profiles_pl_valid check (pl_ratio is null or pl_ratio between 0.10 and 5.00),
  constraint flour_profiles_protein_valid check (protein_percent is null or protein_percent between 0 and 40),
  constraint flour_profiles_ash_valid check (ash_percent is null or ash_percent between 0 and 5),
  constraint flour_profiles_absorption_valid check (absorption_percent is null or absorption_percent between 30 and 150),
  constraint flour_profiles_falling_number_valid check (falling_number is null or falling_number between 50 and 1000),
  constraint flour_profiles_milling_allowed check (milling_method in ('stone','roller','mixed','unknown','other'))
);

create unique index if not exists flour_profiles_owner_identity_idx
on public.flour_profiles (
  owner_user_id,
  lower(coalesce(brand,'')),
  lower(name),
  lower(coalesce(product_line,''))
);

create unique index if not exists flour_profiles_one_default_idx
on public.flour_profiles(owner_user_id)
where is_default;

create index if not exists flour_profiles_owner_name_idx
on public.flour_profiles(owner_user_id, name);

create table if not exists public.fermentation_dough_profile_flours (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  profile_id uuid not null references public.fermentation_dough_profiles(id) on delete cascade,
  flour_profile_id uuid references public.flour_profiles(id) on delete set null,
  flour_profile_snapshot jsonb not null default '{}'::jsonb,
  percentage numeric(6,3) not null,
  weight_g numeric(9,2),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fermentation_dough_profile_flours_percentage_valid check (percentage > 0 and percentage <= 100),
  constraint fermentation_dough_profile_flours_weight_valid check (weight_g is null or weight_g > 0),
  constraint fermentation_dough_profile_flours_sort_valid check (sort_order >= 0),
  constraint fermentation_dough_profile_flours_owner_order_key unique (owner_user_id, profile_id, sort_order)
);

create index if not exists fermentation_dough_profile_flours_profile_idx
on public.fermentation_dough_profile_flours(profile_id, sort_order);

create table if not exists public.baking_session_flours (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  session_id uuid not null references public.baking_sessions(id) on delete cascade,
  flour_profile_id uuid references public.flour_profiles(id) on delete set null,
  flour_profile_snapshot jsonb not null default '{}'::jsonb,
  percentage numeric(6,3) not null,
  weight_g numeric(9,2) not null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint baking_session_flours_percentage_valid check (percentage > 0 and percentage <= 100),
  constraint baking_session_flours_weight_valid check (weight_g > 0),
  constraint baking_session_flours_sort_valid check (sort_order >= 0),
  constraint baking_session_flours_owner_order_key unique (owner_user_id, session_id, sort_order)
);

create index if not exists baking_session_flours_session_idx
on public.baking_session_flours(session_id, sort_order);

alter table public.flour_profiles enable row level security;
alter table public.fermentation_dough_profile_flours enable row level security;
alter table public.baking_session_flours enable row level security;

drop policy if exists flour_profiles_owner_all on public.flour_profiles;
create policy flour_profiles_owner_all
on public.flour_profiles
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists fermentation_dough_profile_flours_owner_all on public.fermentation_dough_profile_flours;
create policy fermentation_dough_profile_flours_owner_all
on public.fermentation_dough_profile_flours
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
  and (
    flour_profile_id is null
    or exists (
      select 1
      from public.flour_profiles flour
      where flour.id = flour_profile_id
        and flour.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists baking_session_flours_owner_all on public.baking_session_flours;
create policy baking_session_flours_owner_all
on public.baking_session_flours
for all
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
  and (
    flour_profile_id is null
    or exists (
      select 1
      from public.flour_profiles flour
      where flour.id = flour_profile_id
        and flour.owner_user_id = auth.uid()
    )
  )
);

grant select, insert, update, delete
on public.flour_profiles,
   public.fermentation_dough_profile_flours,
   public.baking_session_flours
to authenticated;

commit;

select
  to_regclass('public.flour_profiles') as flour_profiles,
  to_regclass('public.fermentation_dough_profile_flours') as fermentation_dough_profile_flours,
  to_regclass('public.baking_session_flours') as baking_session_flours;
