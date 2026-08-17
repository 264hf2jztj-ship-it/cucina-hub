begin;

create extension if not exists pgcrypto;

create or replace function public.shopping_list_normalize_name(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    trim(
      regexp_replace(
        lower(coalesce(p_value, '')),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.shopping_list_guess_category(p_name text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  candidate text := public.shopping_list_normalize_name(p_name);
begin
  if candidate is null then
    return 'other';
  end if;

  if candidate ~ '(mela|mele|pera|pere|banana|arancia|arance|limone|limoni|lime|mandarino|mandarini|fragola|fragole|frutta|verdura|insalata|lattuga|pomodor|carota|carote|zucchin|melanzan|peperon|cipolla|cipolle|aglio|patata|patate|spinaci|cavol|broccol|finocch|sedano|prezzemolo|basilico|menta|rucola|avocado)' then
    return 'produce';
  elsif candidate ~ '(pollo|tacchino|manzo|vitello|maiale|carne|pesce|salmone|tonno|merluzzo|orata|branzino|gamber|uovo|uova|tofu|seitan)' then
    return 'protein';
  elsif candidate ~ '(latte|yogurt|skyr|formaggio|mozzarella|ricotta|burro|panna|parmigiano|pecorino)' then
    return 'dairy';
  elsif candidate ~ '(pane|panino|panini|focaccia|piadina|cracker|grissini|brioche)' then
    return 'bakery';
  elsif candidate ~ '(surgelat|gelato|ghiaccio)' then
    return 'frozen';
  elsif candidate ~ '(acqua|succo|bibita|birra|vino|caffe|tè|te |bevanda)' then
    return 'beverages';
  elsif candidate ~ '(carta|pellicola|alluminio|detersivo|sapone|spugna|sacchetto|tovagliol)' then
    return 'household';
  else
    return 'pantry';
  end if;
end;
$$;

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  week_start date not null,
  name text not null,
  normalized_name text not null,
  quantity numeric(12, 3),
  unit text,
  quantity_text text,
  category text not null default 'other',
  source_type text not null default 'manual',
  source_key text,
  source_label text,
  planned_meal_id uuid references public.planned_meals(id) on delete cascade,
  planned_meal_item_id uuid references public.planned_meal_items(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  note text,
  is_checked boolean not null default false,
  is_excluded boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_list_items_week_monday check (
    extract(isodow from week_start) = 1
  ),
  constraint shopping_list_items_name_length check (
    char_length(trim(name)) between 1 and 200
  ),
  constraint shopping_list_items_normalized_name_length check (
    char_length(normalized_name) between 1 and 200
  ),
  constraint shopping_list_items_quantity_positive check (
    quantity is null or quantity > 0
  ),
  constraint shopping_list_items_unit_length check (
    unit is null or char_length(unit) between 1 and 40
  ),
  constraint shopping_list_items_quantity_text_length check (
    quantity_text is null or char_length(quantity_text) <= 160
  ),
  constraint shopping_list_items_category_allowed check (
    category in (
      'produce',
      'protein',
      'dairy',
      'bakery',
      'pantry',
      'frozen',
      'beverages',
      'household',
      'other'
    )
  ),
  constraint shopping_list_items_source_type_allowed check (
    source_type in (
      'manual',
      'planner_food',
      'planner_preparation',
      'planner_recipe'
    )
  ),
  constraint shopping_list_items_source_key_length check (
    source_key is null or char_length(source_key) between 1 and 300
  ),
  constraint shopping_list_items_source_label_length check (
    source_label is null or char_length(source_label) <= 300
  ),
  constraint shopping_list_items_note_length check (
    note is null or char_length(note) <= 1000
  ),
  constraint shopping_list_items_state_shape check (
    not (is_checked and is_excluded)
  ),
  constraint shopping_list_items_source_shape check (
    (
      source_type = 'manual'
      and source_key is null
      and source_label is null
      and planned_meal_id is null
      and planned_meal_item_id is null
      and recipe_id is null
    )
    or (
      source_type <> 'manual'
      and source_key is not null
      and planned_meal_id is not null
    )
  )
);

create unique index if not exists shopping_list_items_owner_week_source_key
on public.shopping_list_items(owner_user_id, week_start, source_key)
where source_key is not null;

create index if not exists shopping_list_items_owner_week_state_idx
on public.shopping_list_items(
  owner_user_id,
  week_start,
  is_excluded,
  is_checked,
  category
);

create index if not exists shopping_list_items_owner_meal_idx
on public.shopping_list_items(owner_user_id, planned_meal_id)
where planned_meal_id is not null;

create index if not exists shopping_list_items_planned_meal_fk_idx
on public.shopping_list_items(planned_meal_id)
where planned_meal_id is not null;

create index if not exists shopping_list_items_planned_meal_item_fk_idx
on public.shopping_list_items(planned_meal_item_id)
where planned_meal_item_id is not null;

create index if not exists shopping_list_items_recipe_fk_idx
on public.shopping_list_items(recipe_id)
where recipe_id is not null;

create or replace function public.shopping_list_items_prepare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_meal_date date;
begin
  new.name := trim(new.name);
  new.normalized_name := public.shopping_list_normalize_name(new.name);
  new.unit := nullif(trim(new.unit), '');
  new.quantity_text := nullif(trim(new.quantity_text), '');
  new.source_key := nullif(trim(new.source_key), '');
  new.source_label := nullif(trim(new.source_label), '');
  new.note := nullif(trim(new.note), '');

  if new.category is null then
    new.category := public.shopping_list_guess_category(new.name);
  end if;

  if new.source_type = 'manual' then
    new.source_key := null;
    new.source_label := null;
    new.planned_meal_id := null;
    new.planned_meal_item_id := null;
    new.recipe_id := null;
  else
    select meal.planned_date
      into linked_meal_date
    from public.planned_meals meal
    where meal.id = new.planned_meal_id
      and meal.owner_user_id = new.owner_user_id;

    if linked_meal_date is null then
      raise exception using
        errcode = '23503',
        message = 'planned_meal_id must reference a meal owned by the same user';
    end if;

    if date_trunc('week', linked_meal_date::timestamp)::date <> new.week_start then
      raise exception using
        errcode = '23514',
        message = 'shopping list week must contain the linked meal';
    end if;

    if new.planned_meal_item_id is not null
       and not exists (
         select 1
         from public.planned_meal_items item
         where item.id = new.planned_meal_item_id
           and item.planned_meal_id = new.planned_meal_id
           and item.owner_user_id = new.owner_user_id
       ) then
      raise exception using
        errcode = '23503',
        message = 'planned_meal_item_id must belong to the linked meal and user';
    end if;

    if new.recipe_id is not null
       and not exists (
         select 1
         from public.recipes recipe
         where recipe.id = new.recipe_id
           and recipe.owner_user_id = new.owner_user_id
       ) then
      raise exception using
        errcode = '23503',
        message = 'recipe_id must reference a recipe owned by the same user';
    end if;
  end if;

  if new.is_excluded then
    new.is_checked := false;
    new.checked_at := null;
  elsif new.is_checked then
    if tg_op = 'INSERT' then
      new.checked_at := coalesce(new.checked_at, now());
    elsif old.is_checked is distinct from true then
      new.checked_at := coalesce(new.checked_at, now());
    else
      new.checked_at := coalesce(new.checked_at, old.checked_at, now());
    end if;
  else
    new.checked_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shopping_list_items_prepare_guard
on public.shopping_list_items;

create trigger shopping_list_items_prepare_guard
before insert or update on public.shopping_list_items
for each row
execute function public.shopping_list_items_prepare();

alter table public.shopping_list_items enable row level security;

drop policy if exists shopping_list_items_owner_select
on public.shopping_list_items;
create policy shopping_list_items_owner_select
on public.shopping_list_items
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists shopping_list_items_owner_insert
on public.shopping_list_items;
create policy shopping_list_items_owner_insert
on public.shopping_list_items
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists shopping_list_items_owner_update
on public.shopping_list_items;
create policy shopping_list_items_owner_update
on public.shopping_list_items
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists shopping_list_items_owner_delete
on public.shopping_list_items;
create policy shopping_list_items_owner_delete
on public.shopping_list_items
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

grant select, insert, update, delete
on public.shopping_list_items
to authenticated;

create or replace function public.refresh_weekly_shopping_list(p_week_start date)
returns table (
  week_start date,
  generated_count integer,
  active_count integer,
  checked_count integer,
  excluded_count integer,
  deleted_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  v_generated_count integer := 0;
  v_active_count integer := 0;
  v_checked_count integer := 0;
  v_excluded_count integer := 0;
  v_deleted_count integer := 0;
begin
  if current_owner is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if p_week_start is null
     or extract(isodow from p_week_start) <> 1 then
    raise exception using
      errcode = '22007',
      message = 'p_week_start must be a Monday';
  end if;

  drop table if exists pg_temp.shopping_list_refresh_rows;

  create temporary table shopping_list_refresh_rows (
    name text not null,
    quantity numeric(12, 3),
    unit text,
    quantity_text text,
    category text not null,
    source_type text not null,
    source_key text not null,
    source_label text,
    planned_meal_id uuid not null,
    planned_meal_item_id uuid,
    recipe_id uuid,
    note text
  ) on commit drop;

  insert into shopping_list_refresh_rows (
    name,
    quantity,
    unit,
    quantity_text,
    category,
    source_type,
    source_key,
    source_label,
    planned_meal_id,
    planned_meal_item_id,
    recipe_id,
    note
  )
  select
    trim(item.label),
    item.quantity,
    item.unit,
    null,
    public.shopping_list_guess_category(item.label),
    'planner_food',
    'meal-item:' || item.id::text,
    left(
      meal.planned_date::text || ' · ' || meal.meal_slot || ' · ' || trim(item.label),
      300
    ),
    meal.id,
    item.id,
    null,
    left(item.note, 1000)
  from public.planned_meals meal
  join public.planned_meal_items item
    on item.planned_meal_id = meal.id
   and item.owner_user_id = current_owner
  where meal.owner_user_id = current_owner
    and meal.planned_date between p_week_start and (p_week_start + 6)
    and item.item_type = 'food'
    and nullif(trim(item.label), '') is not null

  union all

  select
    trim(ingredient.value ->> 'name'),
    case
      when jsonb_typeof(ingredient.value -> 'quantity') = 'number'
        then (ingredient.value ->> 'quantity')::numeric(12, 3)
      else null
    end,
    nullif(trim(ingredient.value ->> 'unit'), ''),
    null,
    public.shopping_list_guess_category(ingredient.value ->> 'name'),
    'planner_preparation',
    'meal-item:' || item.id::text || ':ingredient:' || ingredient.ordinality::text,
    left(
      meal.planned_date::text || ' · ' || meal.meal_slot || ' · ' || trim(item.label),
      300
    ),
    meal.id,
    item.id,
    null,
    left(item.note, 1000)
  from public.planned_meals meal
  join public.planned_meal_items item
    on item.planned_meal_id = meal.id
   and item.owner_user_id = current_owner
  cross join lateral jsonb_array_elements(coalesce(item.ingredients, '[]'::jsonb))
    with ordinality as ingredient(value, ordinality)
  where meal.owner_user_id = current_owner
    and meal.planned_date between p_week_start and (p_week_start + 6)
    and item.item_type = 'preparation'
    and jsonb_typeof(item.ingredients) = 'array'
    and nullif(trim(ingredient.value ->> 'name'), '') is not null

  union all

  select
    trim(ingredient.name),
    recipe_ingredient.quantity,
    recipe_ingredient.unit,
    left(recipe_ingredient.quantity_text, 160),
    public.shopping_list_guess_category(ingredient.name),
    'planner_recipe',
    'meal-item:' || item.id::text || ':recipe-ingredient:' || recipe_ingredient.id::text,
    left(
      meal.planned_date::text || ' · ' || meal.meal_slot || ' · '
        || coalesce(recipe.title, item.label, item.recipe_code, 'Ricetta'),
      300
    ),
    meal.id,
    item.id,
    recipe.id,
    left(coalesce(recipe_ingredient.notes, recipe_ingredient.preparation), 1000)
  from public.planned_meals meal
  join public.planned_meal_items item
    on item.planned_meal_id = meal.id
   and item.owner_user_id = current_owner
  join public.recipes recipe
    on recipe.id = item.recipe_id
   and recipe.owner_user_id = current_owner
  join public.recipe_ingredients recipe_ingredient
    on recipe_ingredient.recipe_id = recipe.id
  join public.ingredients ingredient
    on ingredient.id = recipe_ingredient.ingredient_id
  where meal.owner_user_id = current_owner
    and meal.planned_date between p_week_start and (p_week_start + 6)
    and item.item_type = 'recipe'
    and nullif(trim(ingredient.name), '') is not null

  union all

  select
    trim(ingredient.name),
    recipe_ingredient.quantity,
    recipe_ingredient.unit,
    left(recipe_ingredient.quantity_text, 160),
    public.shopping_list_guess_category(ingredient.name),
    'planner_recipe',
    'meal:' || meal.id::text || ':recipe-ingredient:' || recipe_ingredient.id::text,
    left(
      meal.planned_date::text || ' · ' || meal.meal_slot || ' · ' || recipe.title,
      300
    ),
    meal.id,
    null,
    recipe.id,
    left(coalesce(recipe_ingredient.notes, recipe_ingredient.preparation), 1000)
  from public.planned_meals meal
  join public.recipes recipe
    on recipe.id = meal.recipe_id
   and recipe.owner_user_id = current_owner
  join public.recipe_ingredients recipe_ingredient
    on recipe_ingredient.recipe_id = recipe.id
  join public.ingredients ingredient
    on ingredient.id = recipe_ingredient.ingredient_id
  where meal.owner_user_id = current_owner
    and meal.planned_date between p_week_start and (p_week_start + 6)
    and not exists (
      select 1
      from public.planned_meal_items item
      where item.planned_meal_id = meal.id
        and item.owner_user_id = current_owner
    )
    and nullif(trim(ingredient.name), '') is not null;

  select count(*)::integer
    into v_generated_count
  from shopping_list_refresh_rows;

  delete from public.shopping_list_items item
  where item.owner_user_id = current_owner
    and item.week_start = p_week_start
    and item.source_type <> 'manual'
    and not exists (
      select 1
      from shopping_list_refresh_rows source
      where source.source_key = item.source_key
    );

  get diagnostics v_deleted_count = row_count;

  insert into public.shopping_list_items (
    owner_user_id,
    week_start,
    name,
    normalized_name,
    quantity,
    unit,
    quantity_text,
    category,
    source_type,
    source_key,
    source_label,
    planned_meal_id,
    planned_meal_item_id,
    recipe_id,
    note
  )
  select
    current_owner,
    p_week_start,
    source.name,
    public.shopping_list_normalize_name(source.name),
    source.quantity,
    source.unit,
    source.quantity_text,
    source.category,
    source.source_type,
    source.source_key,
    source.source_label,
    source.planned_meal_id,
    source.planned_meal_item_id,
    source.recipe_id,
    source.note
  from shopping_list_refresh_rows source
  on conflict (owner_user_id, week_start, source_key)
    where source_key is not null
  do update set
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    quantity = excluded.quantity,
    unit = excluded.unit,
    quantity_text = excluded.quantity_text,
    category = excluded.category,
    source_type = excluded.source_type,
    source_label = excluded.source_label,
    planned_meal_id = excluded.planned_meal_id,
    planned_meal_item_id = excluded.planned_meal_item_id,
    recipe_id = excluded.recipe_id,
    note = excluded.note,
    updated_at = now();

  select
    count(*) filter (where not item.is_checked and not item.is_excluded)::integer,
    count(*) filter (where item.is_checked)::integer,
    count(*) filter (where item.is_excluded)::integer
  into
    v_active_count,
    v_checked_count,
    v_excluded_count
  from public.shopping_list_items item
  where item.owner_user_id = current_owner
    and item.week_start = p_week_start;

  return query
  select
    p_week_start,
    v_generated_count,
    v_active_count,
    v_checked_count,
    v_excluded_count,
    v_deleted_count;
end;
$$;

revoke all on function public.shopping_list_items_prepare()
from public, anon, authenticated;

revoke all on function public.refresh_weekly_shopping_list(date)
from public, anon;

grant execute on function public.refresh_weekly_shopping_list(date)
to authenticated;

comment on table public.shopping_list_items is
  'Lista spesa settimanale personale: voci manuali e voci generate dal Planner.';

comment on function public.refresh_weekly_shopping_list(date) is
  'Rigenera atomicamente le voci automatiche della settimana preservando voci manuali, acquisti ed esclusioni.';

commit;

select
  to_regclass('public.shopping_list_items') as shopping_list_items,
  to_regprocedure('public.refresh_weekly_shopping_list(date)') is not null
    as refresh_function,
  to_regclass('public.shopping_list_items_owner_week_source_key') is not null
    as source_key_index,
  to_regclass('public.shopping_list_items_owner_week_state_idx') is not null
    as week_state_index,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.shopping_list_items'::regclass
  ) as rls_enabled,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shopping_list_items'
  ) as policy_count,
  has_table_privilege(
    'authenticated',
    'public.shopping_list_items',
    'SELECT, INSERT, UPDATE, DELETE'
  ) as authenticated_table_access,
  has_function_privilege(
    'authenticated',
    'public.refresh_weekly_shopping_list(date)',
    'EXECUTE'
  ) as authenticated_refresh_access;
