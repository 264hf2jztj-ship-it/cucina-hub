begin;

alter table public.nutrition_plan_weeks
  add column if not exists source_payload_hash text;

update public.nutrition_plan_weeks
set source_payload_hash = encode(
  digest(convert_to(source_payload::text, 'UTF8'), 'sha256'),
  'hex'
)
where source_payload_hash is null;

alter table public.nutrition_plan_weeks
  alter column source_payload_hash set not null;

alter table public.nutrition_plan_weeks
  drop constraint if exists nutrition_plan_weeks_source_payload_hash_format;

alter table public.nutrition_plan_weeks
  add constraint nutrition_plan_weeks_source_payload_hash_format check (
    source_payload_hash ~ '^[0-9a-f]{64}$'
  );

grant insert on table public.nutrition_plan_weeks to authenticated;

drop policy if exists nutrition_plan_weeks_owner_insert
on public.nutrition_plan_weeks;

create policy nutrition_plan_weeks_owner_insert
on public.nutrition_plan_weeks
for insert
to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.planner_menu_packages package
    where package.id = planner_menu_package_id
      and package.owner_user_id = (select auth.uid())
  )
);

create or replace function public.commit_nutrition_plan(
  p_packet jsonb,
  p_canonical_payload text,
  p_payload_hash text,
  p_resolutions jsonb default '[]'::jsonb,
  p_confirmed_conflicts boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_packet jsonb;
  v_plan jsonb;
  v_check_in jsonb;
  v_goal jsonb;
  v_menu_packet jsonb;
  v_menu_canonical_payload text;
  v_menu_payload_hash text;
  v_verified_hash text;
  v_source_type text;
  v_source_external_id text;
  v_source_revision integer;
  v_week_start date;
  v_week_end date;
  v_measured_at date;
  v_existing_package public.planner_menu_packages%rowtype;
  v_existing_source_hash text;
  v_commit_result jsonb;
  v_package_id uuid;
begin
  if v_owner_user_id is null then
    raise exception using errcode = '42501', message = 'nutrition_commit_auth_required';
  end if;

  if jsonb_typeof(p_packet) <> 'object'
     or jsonb_typeof(p_resolutions) <> 'array'
     or p_canonical_payload is null
     or octet_length(p_canonical_payload) > 2097152 then
    raise exception using errcode = '22023', message = 'nutrition_commit_invalid_request';
  end if;

  if jsonb_array_length(p_resolutions) > 0 and p_confirmed_conflicts is not true then
    raise exception using errcode = 'P0001', message = 'nutrition_commit_conflict_confirmation_required';
  end if;

  begin
    v_packet := p_canonical_payload::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'nutrition_commit_invalid_canonical_payload';
  end;

  if v_packet <> p_packet then
    raise exception using errcode = '22023', message = 'nutrition_commit_payload_mismatch';
  end if;

  v_verified_hash := encode(digest(convert_to(p_canonical_payload, 'UTF8'), 'sha256'), 'hex');
  if p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload_hash <> v_verified_hash then
    raise exception using errcode = '22023', message = 'nutrition_commit_hash_mismatch';
  end if;

  if v_packet ->> 'contract' <> 'cucina-hub.nutrition-plan'
     or v_packet ->> 'version' <> '1'
     or v_packet #>> '{publication,mode}' <> 'auto_if_conflict_free'
     or v_packet #>> '{publication,on_conflict}' <> 'require_confirmation'
     or v_packet #> '{publication,preserve_current_on_error}' <> 'true'::jsonb
     or jsonb_typeof(v_packet -> 'plan') <> 'object'
     or jsonb_typeof(v_packet -> 'check_in') <> 'object'
     or jsonb_typeof(v_packet -> 'goal') <> 'object'
     or jsonb_typeof(v_packet -> 'days') <> 'array'
     or jsonb_array_length(v_packet -> 'days') <> 7 then
    raise exception using errcode = '22023', message = 'nutrition_commit_contract_invalid';
  end if;

  v_plan := v_packet -> 'plan';
  v_check_in := v_packet -> 'check_in';
  v_goal := v_packet -> 'goal';
  v_source_type := btrim(v_plan #>> '{source,type}');
  v_source_external_id := btrim(v_plan ->> 'external_id');

  begin
    v_source_revision := (v_plan ->> 'revision')::integer;
    v_week_start := (v_plan ->> 'week_start')::date;
    v_week_end := (v_plan ->> 'week_end')::date;
    v_measured_at := (v_check_in ->> 'measured_at')::date;
  exception when others then
    raise exception using errcode = '22023', message = 'nutrition_commit_identity_invalid';
  end;

  if v_source_type not in ('chatgpt_project', 'manual', 'other')
     or nullif(v_source_external_id, '') is null
     or char_length(v_source_external_id) > 160
     or v_source_revision < 1
     or v_plan ->> 'timezone' <> 'Europe/Rome'
     or extract(isodow from v_week_start) <> 1
     or v_week_end <> v_week_start + 6
     or nullif(btrim(v_plan ->> 'title'), '') is null
     or nullif(btrim(v_plan #>> '{source,label}'), '') is null
     or nullif(btrim(v_goal ->> 'summary'), '') is null
     or nullif(btrim(v_goal ->> 'strategy'), '') is null then
    raise exception using errcode = '22023', message = 'nutrition_commit_identity_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_packet -> 'days') with ordinality as day_entry(day, day_number)
    where jsonb_typeof(day) <> 'object'
       or jsonb_typeof(day -> 'meals') <> 'array'
       or jsonb_array_length(day -> 'meals') = 0
       or day ->> 'date' <> (v_week_start + (day_number - 1)::integer)::text
  ) then
    raise exception using errcode = '22023', message = 'nutrition_commit_days_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_packet -> 'days') day_entry(day)
    cross join lateral jsonb_array_elements(day -> 'meals') meal_entry(meal)
    where jsonb_typeof(meal) <> 'object'
       or nullif(btrim(meal ->> 'key'), '') is null
       or nullif(btrim(meal ->> 'title'), '') is null
       or meal ->> 'slot' not in (
         'breakfast', 'morning_snack', 'lunch', 'pre_workout',
         'post_workout', 'afternoon_snack', 'dinner', 'other'
       )
       or jsonb_typeof(meal -> 'components') <> 'array'
       or (
         jsonb_array_length(meal -> 'components') = 0
         and jsonb_typeof(meal -> 'recipe_ref') is distinct from 'object'
       )
       or (
         jsonb_typeof(meal -> 'recipe_ref') = 'object'
         and nullif(btrim(meal #>> '{recipe_ref,code}'), '') is null
       )
  ) then
    raise exception using errcode = '22023', message = 'nutrition_commit_meals_invalid';
  end if;

  -- Usa lo stesso lock del commit Planner: la proiezione e il payload nutrizionale
  -- diventano visibili insieme oppure vengono entrambi annullati.
  perform pg_advisory_xact_lock(hashtextextended('planner-menu:' || v_owner_user_id::text, 0));

  select package.*
  into v_existing_package
  from public.planner_menu_packages package
  where package.owner_user_id = v_owner_user_id
    and package.source_type = v_source_type
    and package.source_external_id = v_source_external_id
    and package.source_revision = v_source_revision
  for update of package;

  if found then
    select nutrition.source_payload_hash
    into v_existing_source_hash
    from public.nutrition_plan_weeks nutrition
    where nutrition.owner_user_id = v_owner_user_id
      and nutrition.planner_menu_package_id = v_existing_package.id;

    if v_existing_source_hash is null then
      raise exception using errcode = '23505', message = 'nutrition_commit_identity_collision';
    end if;
    if v_existing_source_hash <> p_payload_hash then
      raise exception using errcode = '23505', message = 'nutrition_commit_same_revision_payload_mismatch';
    end if;
    return jsonb_build_object(
      'status', 'already_imported',
      'created', false,
      'package_id', v_existing_package.id,
      'source_external_id', v_source_external_id,
      'source_revision', v_source_revision,
      'nutrition_payload_hash', p_payload_hash,
      'nutrition_plan_saved', true,
      'counts', jsonb_build_object(
        'meals', (
          select count(*) from public.planned_meals meal
          where meal.owner_user_id = v_owner_user_id
            and meal.menu_package_id = v_existing_package.id
        ),
        'items', (
          select count(*)
          from public.planned_meal_items item
          join public.planned_meals meal on meal.id = item.planned_meal_id
          where meal.owner_user_id = v_owner_user_id
            and meal.menu_package_id = v_existing_package.id
        )
      )
    );
  end if;

  select jsonb_build_object(
    'contract', 'cucina-hub.menu-plan',
    'version', 1,
    'menu', jsonb_build_object(
      'external_id', v_source_external_id,
      'revision', v_source_revision,
      'title', v_plan -> 'title',
      'period_start', v_plan -> 'week_start',
      'period_end', v_plan -> 'week_end',
      'source', v_plan -> 'source'
    ),
    'days', (
      select jsonb_agg(
        jsonb_build_object(
          'date', day -> 'date',
          'meals', (
            select jsonb_agg(
              jsonb_strip_nulls(jsonb_build_object(
                'key', meal -> 'key',
                'slot', meal -> 'slot',
                'time', meal -> 'time',
                'note', meal -> 'note',
                'items',
                  case when jsonb_typeof(meal -> 'recipe_ref') = 'object'
                    then jsonb_build_array(jsonb_build_object(
                      'key', format('np-d%s-m%s-r', day_number, meal_number),
                      'type', 'recipe',
                      'recipe_code', meal #> '{recipe_ref,code}',
                      'label', meal -> 'title'
                    ))
                    else '[]'::jsonb
                  end
                  || coalesce((
                    select jsonb_agg(
                      jsonb_strip_nulls(jsonb_build_object(
                        'key', format('np-d%s-m%s-c%s', day_number, meal_number, component_number),
                        'type', 'food',
                        'label', component -> 'name',
                        'quantity', component -> 'quantity',
                        'unit', component -> 'unit',
                        'note', component -> 'note'
                      ))
                      order by component_number
                    )
                    from jsonb_array_elements(meal -> 'components') with ordinality
                      as component_entry(component, component_number)
                  ), '[]'::jsonb)
              ))
              order by meal_number
            )
            from jsonb_array_elements(day -> 'meals') with ordinality
              as meal_entry(meal, meal_number)
          )
        )
        order by day_number
      )
      from jsonb_array_elements(v_packet -> 'days') with ordinality
        as day_entry(day, day_number)
    ),
    'guardrails', jsonb_build_object(
      'preview_only', true,
      'automatic_save', false,
      'requires_user_confirmation', true
    )
  )
  into v_menu_packet;

  v_menu_canonical_payload := v_menu_packet::text;
  v_menu_payload_hash := encode(
    digest(convert_to(v_menu_canonical_payload, 'UTF8'), 'sha256'),
    'hex'
  );

  v_commit_result := public.commit_planner_menu_package(
    v_menu_packet,
    v_menu_canonical_payload,
    v_menu_payload_hash,
    p_resolutions,
    true
  );
  v_package_id := (v_commit_result ->> 'package_id')::uuid;

  insert into public.nutrition_plan_weeks (
    planner_menu_package_id,
    owner_user_id,
    timezone,
    measured_at,
    weight_kg,
    waist_cm,
    body_fat_percent,
    check_in_note,
    goal_summary,
    protein_target_min_g,
    protein_target_max_g,
    strategy,
    source_payload,
    source_payload_hash
  ) values (
    v_package_id,
    v_owner_user_id,
    v_plan ->> 'timezone',
    v_measured_at,
    (v_check_in ->> 'weight_kg')::numeric,
    (v_check_in ->> 'waist_cm')::numeric,
    (v_check_in ->> 'body_fat_percent')::numeric,
    v_check_in ->> 'note',
    v_goal ->> 'summary',
    (v_goal #>> '{protein_target_g,min}')::smallint,
    (v_goal #>> '{protein_target_g,max}')::smallint,
    v_goal ->> 'strategy',
    v_packet,
    p_payload_hash
  );

  return v_commit_result || jsonb_build_object(
    'nutrition_payload_hash', p_payload_hash,
    'nutrition_plan_saved', true
  );
end;
$$;

revoke all on function public.commit_nutrition_plan(jsonb, text, text, jsonb, boolean)
from public, anon, authenticated;

grant execute on function public.commit_nutrition_plan(jsonb, text, text, jsonb, boolean)
to authenticated;

comment on function public.commit_nutrition_plan(jsonb, text, text, jsonb, boolean) is
  'Importa atomicamente un piano nutrizionale v1, proiettandone i pasti nel Planner e conservando il payload completo privato.';

comment on column public.nutrition_plan_weeks.source_payload_hash is
  'SHA-256 del payload nutrizionale canonico verificato, usato per retry idempotenti e revisioni immutabili.';

commit;

select
  to_regprocedure('public.commit_nutrition_plan(jsonb,text,text,jsonb,boolean)') is not null
    as nutrition_commit_function,
  has_table_privilege('authenticated', 'public.nutrition_plan_weeks', 'insert')
    as authenticated_can_insert,
  has_function_privilege(
    'authenticated',
    'public.commit_nutrition_plan(jsonb,text,text,jsonb,boolean)',
    'execute'
  ) as authenticated_can_commit;
