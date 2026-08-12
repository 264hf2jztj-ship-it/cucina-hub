begin;

create extension if not exists pgcrypto;

create table if not exists public.planner_menu_packages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  title text,
  period_start date not null,
  period_end date not null,
  source_type text not null,
  source_external_id text not null,
  source_revision integer not null default 1,
  source_label text not null,
  source_generated_at timestamptz,
  payload_hash text,
  import_status text not null default 'preview',
  confirmed_at timestamptz,
  supersedes_id uuid references public.planner_menu_packages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_menu_packages_period_valid check (
    period_end >= period_start
  ),
  constraint planner_menu_packages_source_type_allowed check (
    source_type in ('chatgpt_project', 'manual', 'other')
  ),
  constraint planner_menu_packages_revision_positive check (
    source_revision >= 1
  ),
  constraint planner_menu_packages_status_allowed check (
    import_status in ('preview', 'confirmed', 'superseded', 'cancelled')
  ),
  constraint planner_menu_packages_title_length check (
    title is null or char_length(title) <= 240
  ),
  constraint planner_menu_packages_external_id_length check (
    char_length(source_external_id) between 1 and 160
  ),
  constraint planner_menu_packages_source_label_length check (
    char_length(source_label) between 1 and 200
  ),
  constraint planner_menu_packages_payload_hash_format check (
    payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint planner_menu_packages_confirmed_shape check (
    import_status <> 'confirmed'
    or (payload_hash is not null and confirmed_at is not null)
  ),
  constraint planner_menu_packages_not_self_superseding check (
    supersedes_id is null or supersedes_id <> id
  )
);

create unique index if not exists planner_menu_packages_owner_source_revision_key
on public.planner_menu_packages(
  owner_user_id,
  source_type,
  source_external_id,
  source_revision
);

create index if not exists planner_menu_packages_owner_period_idx
on public.planner_menu_packages(owner_user_id, period_start, period_end);

create index if not exists planner_menu_packages_owner_status_idx
on public.planner_menu_packages(owner_user_id, import_status, period_start);

create or replace function public.planner_menu_packages_validate_supersedes_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.supersedes_id is not null
     and not exists (
       select 1
       from public.planner_menu_packages previous_package
       where previous_package.id = new.supersedes_id
         and previous_package.owner_user_id = new.owner_user_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'supersedes_id must reference a menu package owned by the same user';
  end if;

  return new;
end;
$$;

revoke all on function public.planner_menu_packages_validate_supersedes_owner() from public;

drop trigger if exists planner_menu_packages_supersedes_owner_guard
on public.planner_menu_packages;

create trigger planner_menu_packages_supersedes_owner_guard
before insert or update of supersedes_id, owner_user_id
on public.planner_menu_packages
for each row
execute function public.planner_menu_packages_validate_supersedes_owner();

alter table public.planner_menu_packages enable row level security;

drop policy if exists planner_menu_packages_owner_select on public.planner_menu_packages;
create policy planner_menu_packages_owner_select
on public.planner_menu_packages
for select
using (owner_user_id = auth.uid());

drop policy if exists planner_menu_packages_owner_insert on public.planner_menu_packages;
create policy planner_menu_packages_owner_insert
on public.planner_menu_packages
for insert
with check (owner_user_id = auth.uid());

drop policy if exists planner_menu_packages_owner_update on public.planner_menu_packages;
create policy planner_menu_packages_owner_update
on public.planner_menu_packages
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists planner_menu_packages_owner_delete on public.planner_menu_packages;
create policy planner_menu_packages_owner_delete
on public.planner_menu_packages
for delete
using (owner_user_id = auth.uid());

grant select, insert, update, delete on public.planner_menu_packages to authenticated;

alter table public.planned_meals
  add column if not exists menu_package_id uuid,
  add column if not exists source_meal_key text,
  add column if not exists is_user_modified boolean not null default false;

alter table public.planned_meals
  alter column recipe_id drop not null;

alter table public.planned_meals
  drop constraint if exists planned_meals_recipe_id_fkey;

alter table public.planned_meals
  add constraint planned_meals_recipe_id_fkey
  foreign key (recipe_id)
  references public.recipes(id)
  on delete set null;

alter table public.planned_meals
  drop constraint if exists planned_meals_menu_package_id_fkey;

alter table public.planned_meals
  add constraint planned_meals_menu_package_id_fkey
  foreign key (menu_package_id)
  references public.planner_menu_packages(id)
  on delete cascade;

alter table public.planned_meals
  drop constraint if exists planned_meals_source_key_shape;

alter table public.planned_meals
  add constraint planned_meals_source_key_shape check (
    (menu_package_id is null and source_meal_key is null)
    or (menu_package_id is not null and source_meal_key is not null and char_length(source_meal_key) between 1 and 200)
  );

create unique index if not exists planned_meals_owner_package_source_key
on public.planned_meals(owner_user_id, menu_package_id, source_meal_key)
where menu_package_id is not null;

create index if not exists planned_meals_owner_package_idx
on public.planned_meals(owner_user_id, menu_package_id, planned_date, meal_slot);

drop policy if exists planned_meals_owner_select on public.planned_meals;
create policy planned_meals_owner_select
on public.planned_meals
for select
using (
  owner_user_id = auth.uid()
  and (
    recipe_id is null
    or exists (
      select 1
      from public.recipes recipe
      where recipe.id = recipe_id
        and recipe.owner_user_id = auth.uid()
    )
  )
  and (
    menu_package_id is null
    or exists (
      select 1
      from public.planner_menu_packages package
      where package.id = menu_package_id
        and package.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists planned_meals_owner_insert on public.planned_meals;
create policy planned_meals_owner_insert
on public.planned_meals
for insert
with check (
  owner_user_id = auth.uid()
  and (
    recipe_id is null
    or exists (
      select 1
      from public.recipes recipe
      where recipe.id = recipe_id
        and recipe.owner_user_id = auth.uid()
    )
  )
  and (
    menu_package_id is null
    or exists (
      select 1
      from public.planner_menu_packages package
      where package.id = menu_package_id
        and package.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists planned_meals_owner_update on public.planned_meals;
create policy planned_meals_owner_update
on public.planned_meals
for update
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and (
    recipe_id is null
    or exists (
      select 1
      from public.recipes recipe
      where recipe.id = recipe_id
        and recipe.owner_user_id = auth.uid()
    )
  )
  and (
    menu_package_id is null
    or exists (
      select 1
      from public.planner_menu_packages package
      where package.id = menu_package_id
        and package.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists planned_meals_owner_delete on public.planned_meals;
create policy planned_meals_owner_delete
on public.planned_meals
for delete
using (owner_user_id = auth.uid());

create table if not exists public.planned_meal_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  planned_meal_id uuid not null references public.planned_meals(id) on delete cascade,
  position smallint not null default 1,
  item_type text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  recipe_code text,
  label text,
  quantity numeric(12, 3),
  unit text,
  ingredients jsonb,
  procedure jsonb,
  note text,
  source_item_key text,
  is_user_modified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_meal_items_position_range check (
    position between 1 and 100
  ),
  constraint planned_meal_items_type_allowed check (
    item_type in ('recipe', 'food', 'preparation')
  ),
  constraint planned_meal_items_quantity_positive check (
    quantity is null or quantity > 0
  ),
  constraint planned_meal_items_quantity_unit_shape check (
    quantity is null or (unit is not null and char_length(trim(unit)) between 1 and 40)
  ),
  constraint planned_meal_items_label_length check (
    label is null or char_length(label) <= 240
  ),
  constraint planned_meal_items_recipe_code_length check (
    recipe_code is null or char_length(recipe_code) between 1 and 120
  ),
  constraint planned_meal_items_source_key_length check (
    source_item_key is null or char_length(source_item_key) between 1 and 200
  ),
  constraint planned_meal_items_note_length check (
    note is null or char_length(note) <= 2000
  ),
  constraint planned_meal_items_ingredients_array check (
    ingredients is null or jsonb_typeof(ingredients) = 'array'
  ),
  constraint planned_meal_items_procedure_array check (
    procedure is null or jsonb_typeof(procedure) = 'array'
  ),
  constraint planned_meal_items_type_shape check (
    (
      item_type = 'recipe'
      and (recipe_id is not null or recipe_code is not null)
      and ingredients is null
      and procedure is null
    )
    or (
      item_type = 'food'
      and recipe_id is null
      and recipe_code is null
      and label is not null
      and ingredients is null
      and procedure is null
    )
    or (
      item_type = 'preparation'
      and recipe_id is null
      and recipe_code is null
      and label is not null
    )
  )
);

create unique index if not exists planned_meal_items_meal_position_key
on public.planned_meal_items(planned_meal_id, position);

create unique index if not exists planned_meal_items_meal_source_key
on public.planned_meal_items(planned_meal_id, source_item_key)
where source_item_key is not null;

create index if not exists planned_meal_items_owner_meal_idx
on public.planned_meal_items(owner_user_id, planned_meal_id, position);

create index if not exists planned_meal_items_owner_recipe_idx
on public.planned_meal_items(owner_user_id, recipe_id)
where recipe_id is not null;

alter table public.planned_meal_items enable row level security;

drop policy if exists planned_meal_items_owner_select on public.planned_meal_items;
create policy planned_meal_items_owner_select
on public.planned_meal_items
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
);

drop policy if exists planned_meal_items_owner_insert on public.planned_meal_items;
create policy planned_meal_items_owner_insert
on public.planned_meal_items
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
  and (
    item_type <> 'recipe'
    or (
      recipe_id is not null
      and exists (
        select 1
        from public.recipes recipe
        where recipe.id = recipe_id
          and recipe.owner_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists planned_meal_items_owner_update on public.planned_meal_items;
create policy planned_meal_items_owner_update
on public.planned_meal_items
for update
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
  and (
    item_type <> 'recipe'
    or (
      recipe_id is not null
      and exists (
        select 1
        from public.recipes recipe
        where recipe.id = recipe_id
          and recipe.owner_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists planned_meal_items_owner_delete on public.planned_meal_items;
create policy planned_meal_items_owner_delete
on public.planned_meal_items
for delete
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.planned_meal_items to authenticated;

insert into public.planned_meal_items (
  owner_user_id,
  planned_meal_id,
  position,
  item_type,
  recipe_id,
  recipe_code,
  label,
  source_item_key,
  is_user_modified
)
select
  meal.owner_user_id,
  meal.id,
  1,
  'recipe',
  meal.recipe_id,
  recipe.code,
  recipe.title,
  'legacy-recipe',
  false
from public.planned_meals meal
join public.recipes recipe
  on recipe.id = meal.recipe_id
 and recipe.owner_user_id = meal.owner_user_id
where meal.recipe_id is not null
  and not exists (
    select 1
    from public.planned_meal_items item
    where item.planned_meal_id = meal.id
  );

comment on table public.planner_menu_packages is
  'Pacchetti menu personali importabili in modo idempotente, con periodo, provenienza, revisione e stato di conferma.';

comment on table public.planned_meal_items is
  'Elementi ordinati che compongono un pasto del Planner: ricette della Biblioteca, alimenti o preparazioni autonome.';

comment on column public.planned_meals.recipe_id is
  'Collegamento legacy mantenuto temporaneamente per compatibilità con Planner Core; i nuovi pasti multi-elemento usano planned_meal_items.';

comment on column public.planned_meals.menu_package_id is
  'Pacchetto menu di provenienza. NULL indica un pasto pianificato manualmente.';

commit;

select
  to_regclass('public.planner_menu_packages') as planner_menu_packages,
  to_regclass('public.planned_meal_items') as planned_meal_items,
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planned_meals'
      and column_name = 'recipe_id'
  ) as planned_meals_recipe_nullable,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planned_meals'
      and column_name = 'menu_package_id'
  ) as planned_meals_has_menu_package,
  to_regclass('public.planner_menu_packages_owner_source_revision_key') is not null
    as package_idempotency_guard,
  to_regclass('public.planned_meals_owner_package_source_key') is not null
    as meal_source_key_guard,
  to_regclass('public.planned_meal_items_meal_source_key') is not null
    as item_source_key_guard,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.planner_menu_packages'::regclass
  ) as packages_rls_enabled,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.planned_meal_items'::regclass
  ) as items_rls_enabled,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planner_menu_packages'
  ) as package_policy_count,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planned_meal_items'
  ) as item_policy_count,
  (
    select count(*)
    from public.planned_meals meal
    where meal.recipe_id is not null
      and exists (
        select 1
        from public.planned_meal_items item
        where item.planned_meal_id = meal.id
          and item.item_type = 'recipe'
      )
  ) as legacy_meals_backfilled;
