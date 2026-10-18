begin;

create table public.weber_cook_configurations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  cooking_method text not null check (cooking_method in ('direct','indirect','two_zone','snake')),
  fuel_type text not null check (fuel_type in ('briquettes','charcoal','mixed','other')),
  fuel_amount numeric(8,2) check (fuel_amount > 0),
  fuel_unit text check (fuel_unit in ('pieces','g','kg','chimney')),
  ignition_method text check (char_length(ignition_method) <= 300),
  vent_bottom_percent smallint check (vent_bottom_percent between 0 and 100),
  vent_top_percent smallint check (vent_top_percent between 0 and 100),
  target_grate_temp_c smallint check (target_grate_temp_c between 40 and 450),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weber_configurations_fuel_pair check ((fuel_amount is null) = (fuel_unit is null))
);

comment on table public.weber_cook_configurations is 'Preset personali Weber. I parametri vengono copiati nelle nuove sessioni: modificare o eliminare il preset non altera lo storico.';
create index weber_configurations_owner_title_idx on public.weber_cook_configurations(owner_user_id, title);
alter table public.weber_cook_configurations enable row level security;
revoke all on table public.weber_cook_configurations from anon, authenticated;
grant select, insert, update, delete on table public.weber_cook_configurations to authenticated;
create policy weber_configurations_select on public.weber_cook_configurations for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy weber_configurations_insert on public.weber_cook_configurations for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);
create policy weber_configurations_update on public.weber_cook_configurations for update to authenticated
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy weber_configurations_delete on public.weber_cook_configurations for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

commit;
