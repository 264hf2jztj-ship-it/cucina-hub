begin;

-- PostgreSQL resolves nested UNION columns from left to right. In migration 046,
-- the first two recipe_id values were untyped NULLs, so their intermediate
-- result became text before the UUID recipe branch was considered.
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
    null::text,
    public.shopping_list_guess_category(item.label),
    'planner_food',
    'meal-item:' || item.id::text,
    left(
      meal.planned_date::text || ' · ' || meal.meal_slot || ' · ' || trim(item.label),
      300
    ),
    meal.id,
    item.id,
    null::uuid,
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
      else null::numeric(12, 3)
    end,
    nullif(trim(ingredient.value ->> 'unit'), ''),
    null::text,
    public.shopping_list_guess_category(ingredient.value ->> 'name'),
    'planner_preparation',
    'meal-item:' || item.id::text || ':ingredient:' || ingredient.ordinality::text,
    left(
      meal.planned_date::text || ' · ' || meal.meal_slot || ' · ' || trim(item.label),
      300
    ),
    meal.id,
    item.id,
    null::uuid,
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
    null::uuid,
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

revoke all on function public.refresh_weekly_shopping_list(date)
from public, anon, authenticated;

grant execute on function public.refresh_weekly_shopping_list(date)
to authenticated;

comment on function public.refresh_weekly_shopping_list(date) is
  'Rigenera atomicamente le voci automatiche della settimana preservando voci manuali, acquisti ed esclusioni.';

commit;

select
  to_regprocedure('public.refresh_weekly_shopping_list(date)') is not null
    as refresh_function,
  position(
    'null::uuid' in lower(
      pg_get_functiondef('public.refresh_weekly_shopping_list(date)'::regprocedure)
    )
  ) > 0 as union_uuid_casts,
  has_function_privilege(
    'authenticated',
    'public.refresh_weekly_shopping_list(date)',
    'EXECUTE'
  ) as authenticated_refresh_access;
