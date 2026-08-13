begin;

create extension if not exists pgcrypto;

create or replace function public.commit_planner_menu_package(
  p_packet jsonb,
  p_canonical_payload text,
  p_payload_hash text,
  p_resolutions jsonb default '[]'::jsonb,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_packet jsonb;
  v_menu jsonb;
  v_source jsonb;
  v_source_type text;
  v_source_external_id text;
  v_source_revision integer;
  v_period_start date;
  v_period_end date;
  v_verified_hash text;
  v_existing_package public.planner_menu_packages%rowtype;
  v_latest_package public.planner_menu_packages%rowtype;
  v_package public.planner_menu_packages%rowtype;
  v_existing_meal public.planned_meals%rowtype;
  v_existing_item public.planned_meal_items%rowtype;
  v_collision record;
  v_package_id uuid;
  v_meal_id uuid;
  v_recipe_id uuid;
  v_supersedes_id uuid;
  v_resolution jsonb;
  v_day jsonb;
  v_meal jsonb;
  v_item jsonb;
  v_incoming_meal_key text;
  v_item_path text;
  v_recipe_code text;
  v_recipe_matches integer;
  v_day_index integer;
  v_meal_index integer;
  v_item_index integer;
  v_item_position integer;
  v_items_in_meal integer;
  v_meals_inserted integer := 0;
  v_items_inserted integer := 0;
  v_meals_skipped integer := 0;
  v_items_skipped integer := 0;
  v_preserved_items integer := 0;
  v_deleted_meals integer := 0;
  v_affected integer := 0;
  v_superseded_packages integer := 0;
  v_preserved_meal_ids uuid[] := array[]::uuid[];
  v_delete_meal_ids uuid[] := array[]::uuid[];
  v_replace_package_ids uuid[] := array[]::uuid[];
  v_skip_meal_keys text[] := array[]::text[];
begin
  if v_owner_user_id is null then
    raise exception using errcode = '42501', message = 'menu_commit_auth_required';
  end if;

  if p_confirmed is not true then
    raise exception using errcode = 'P0001', message = 'menu_commit_confirmation_required';
  end if;

  if jsonb_typeof(p_packet) <> 'object'
     or jsonb_typeof(p_resolutions) <> 'array'
     or p_canonical_payload is null
     or octet_length(p_canonical_payload) > 2097152 then
    raise exception using errcode = '22023', message = 'menu_commit_invalid_request';
  end if;

  begin
    v_packet := p_canonical_payload::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'menu_commit_invalid_canonical_payload';
  end;

  if v_packet <> p_packet then
    raise exception using errcode = '22023', message = 'menu_commit_payload_mismatch';
  end if;

  v_verified_hash := encode(digest(convert_to(p_canonical_payload, 'UTF8'), 'sha256'), 'hex');
  if p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload_hash <> v_verified_hash then
    raise exception using errcode = '22023', message = 'menu_commit_hash_mismatch';
  end if;

  if v_packet ->> 'contract' <> 'cucina-hub.menu-plan'
     or v_packet ->> 'version' <> '1'
     or v_packet #>> '{guardrails,preview_only}' <> 'true'
     or v_packet #>> '{guardrails,automatic_save}' <> 'false'
     or v_packet #>> '{guardrails,requires_user_confirmation}' <> 'true'
     or jsonb_typeof(v_packet -> 'days') <> 'array' then
    raise exception using errcode = '22023', message = 'menu_commit_contract_invalid';
  end if;

  v_menu := v_packet -> 'menu';
  v_source := v_menu -> 'source';
  if jsonb_typeof(v_menu) <> 'object' or jsonb_typeof(v_source) <> 'object' then
    raise exception using errcode = '22023', message = 'menu_commit_contract_invalid';
  end if;

  v_source_type := btrim(v_source ->> 'type');
  v_source_external_id := btrim(v_menu ->> 'external_id');
  begin
    v_source_revision := (v_menu ->> 'revision')::integer;
    v_period_start := (v_menu ->> 'period_start')::date;
    v_period_end := (v_menu ->> 'period_end')::date;
  exception when others then
    raise exception using errcode = '22023', message = 'menu_commit_identity_invalid';
  end;

  if v_source_type not in ('chatgpt_project', 'manual', 'other')
     or v_source_external_id is null
     or char_length(v_source_external_id) not between 1 and 160
     or v_source_revision < 1
     or v_period_end < v_period_start
     or nullif(btrim(v_source ->> 'label'), '') is null then
    raise exception using errcode = '22023', message = 'menu_commit_identity_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_resolutions) resolution
    where jsonb_typeof(resolution) <> 'object'
       or resolution ->> 'action' = 'cancel_import'
       or (
         resolution ->> 'code' in ('missing_library_reference', 'ambiguous_library_reference')
         and resolution ->> 'action' not in ('map_recipe', 'skip_incoming_item')
       )
       or (
         resolution ->> 'code' = 'overlapping_menu_package'
         and resolution ->> 'action' not in ('keep_existing', 'use_incoming')
       )
       or (
         resolution ->> 'code' in ('existing_manual_meal', 'user_modified_imported_meal')
         and resolution ->> 'action' not in ('keep_existing', 'use_incoming', 'skip_incoming_meal')
       )
       or (
         resolution ->> 'code' = 'user_modified_imported_item'
         and resolution ->> 'action' not in ('keep_existing', 'use_incoming', 'skip_incoming_item')
       )
       or resolution ->> 'code' not in (
         'missing_library_reference',
         'ambiguous_library_reference',
         'overlapping_menu_package',
         'existing_manual_meal',
         'user_modified_imported_meal',
         'user_modified_imported_item'
       )
  ) then
    raise exception using errcode = '22023', message = 'menu_commit_resolution_invalid';
  end if;

  -- Serializza tutti i commit menu dello stesso proprietario. Il controllo idempotente
  -- viene quindi ripetuto dentro la stessa transazione che crea i record.
  perform pg_advisory_xact_lock(hashtextextended('planner-menu:' || v_owner_user_id::text, 0));

  -- Blocca per la sola durata del commit eventuali scritture manuali concorrenti:
  -- una modifica arrivata prima viene vista nei controlli, una successiva attende.
  lock table public.planned_meals in share row exclusive mode;
  lock table public.planned_meal_items in share row exclusive mode;

  select package.*
  into v_existing_package
  from public.planner_menu_packages package
  where package.owner_user_id = v_owner_user_id
    and package.source_type = v_source_type
    and package.source_external_id = v_source_external_id
    and package.source_revision = v_source_revision
  for update;

  if found then
    if v_existing_package.payload_hash = p_payload_hash then
      return jsonb_build_object(
        'status', 'already_imported',
        'created', false,
        'package_id', v_existing_package.id,
        'source_external_id', v_source_external_id,
        'source_revision', v_source_revision,
        'payload_hash', p_payload_hash,
        'counts', jsonb_build_object(
          'meals', (
            select count(*)
            from public.planned_meals meal
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
    raise exception using errcode = '23505', message = 'menu_commit_same_revision_payload_mismatch';
  end if;

  select package.*
  into v_latest_package
  from public.planner_menu_packages package
  where package.owner_user_id = v_owner_user_id
    and package.source_type = v_source_type
    and package.source_external_id = v_source_external_id
  order by package.source_revision desc
  limit 1
  for update;

  if found then
    if v_latest_package.source_revision > v_source_revision then
      raise exception using errcode = 'P0001', message = 'menu_commit_stale_revision';
    end if;
    v_supersedes_id := v_latest_package.id;
  end if;

  -- Ogni menu attivo che si sovrappone deve avere ancora la stessa decisione
  -- esplicita vista in anteprima. Un conflitto apparso nel frattempo blocca tutto.
  for v_package in
    select package.*
    from public.planner_menu_packages package
    where package.owner_user_id = v_owner_user_id
      and package.import_status not in ('cancelled', 'superseded')
      and package.period_start <= v_period_end
      and package.period_end >= v_period_start
    order by package.period_start, package.id
    for update
  loop
    select resolution
    into v_resolution
    from jsonb_array_elements(p_resolutions) resolution
    where resolution ->> 'code' = 'overlapping_menu_package'
      and resolution ->> 'package_id' = v_package.id::text
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'menu_commit_conflicts_changed';
    end if;
    if v_resolution ->> 'action' = 'use_incoming' then
      v_replace_package_ids := array_append(v_replace_package_ids, v_package.id);
    end if;
  end loop;

  -- Ricontrolla i pasti manuali in collisione e prepara le operazioni richieste.
  for v_collision in
    select meal.id as existing_meal_id, incoming.meal_key
    from public.planned_meals meal
    join (
      select
        day.value ->> 'date' as planned_date,
        meal.value ->> 'slot' as meal_slot,
        meal.value ->> 'key' as meal_key
      from jsonb_array_elements(v_packet -> 'days') day(value)
      cross join lateral jsonb_array_elements(day.value -> 'meals') meal(value)
    ) incoming
      on incoming.planned_date = meal.planned_date::text
     and incoming.meal_slot = meal.meal_slot
    where meal.owner_user_id = v_owner_user_id
      and meal.menu_package_id is null
    order by meal.planned_date, meal.id
    for update of meal
  loop
    select resolution
    into v_resolution
    from jsonb_array_elements(p_resolutions) resolution
    where resolution ->> 'code' = 'existing_manual_meal'
      and resolution ->> 'existing_meal_id' = v_collision.existing_meal_id::text
      and resolution ->> 'incoming_meal_key' = v_collision.meal_key
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'menu_commit_conflicts_changed';
    end if;
    if v_resolution ->> 'action' = 'use_incoming' then
      v_delete_meal_ids := array_append(v_delete_meal_ids, v_collision.existing_meal_id);
    elsif v_resolution ->> 'action' = 'skip_incoming_meal' then
      v_skip_meal_keys := array_append(v_skip_meal_keys, v_collision.meal_key);
    end if;
  end loop;

  -- Protegge i pasti importati modificati manualmente, anche quando appartengono
  -- a una revisione precedente che non occupa più lo stesso periodo.
  for v_existing_meal in
    select meal.*
    from public.planned_meals meal
    join public.planner_menu_packages package on package.id = meal.menu_package_id
    where meal.owner_user_id = v_owner_user_id
      and meal.is_user_modified is true
      and package.import_status not in ('cancelled', 'superseded')
      and (
        (package.source_type = v_source_type and package.source_external_id = v_source_external_id)
        or exists (
          select 1
          from jsonb_array_elements(v_packet -> 'days') day(value)
          cross join lateral jsonb_array_elements(day.value -> 'meals') incoming(value)
          where day.value ->> 'date' = meal.planned_date::text
            and incoming.value ->> 'slot' = meal.meal_slot
        )
      )
    order by meal.planned_date, meal.id
    for update of meal
  loop
    select incoming.meal_key
    into v_incoming_meal_key
    from (
      select
        day.value ->> 'date' as planned_date,
        meal.value ->> 'slot' as meal_slot,
        meal.value ->> 'key' as meal_key,
        case when meal.value ->> 'key' = v_existing_meal.source_meal_key then 0 else 1 end as priority
      from jsonb_array_elements(v_packet -> 'days') day(value)
      cross join lateral jsonb_array_elements(day.value -> 'meals') meal(value)
      where meal.value ->> 'key' = v_existing_meal.source_meal_key
         or (
           day.value ->> 'date' = v_existing_meal.planned_date::text
           and meal.value ->> 'slot' = v_existing_meal.meal_slot
         )
    ) incoming
    order by incoming.priority
    limit 1;

    select resolution
    into v_resolution
    from jsonb_array_elements(p_resolutions) resolution
    where resolution ->> 'code' = 'user_modified_imported_meal'
      and resolution ->> 'existing_meal_id' = v_existing_meal.id::text
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'menu_commit_conflicts_changed';
    end if;
    if v_resolution ->> 'action' = 'use_incoming' then
      v_delete_meal_ids := array_append(v_delete_meal_ids, v_existing_meal.id);
    else
      v_preserved_meal_ids := array_append(v_preserved_meal_ids, v_existing_meal.id);
      if v_incoming_meal_key is not null then
        v_skip_meal_keys := array_append(v_skip_meal_keys, v_incoming_meal_key);
      end if;
    end if;
  end loop;

  -- Ogni elemento importato e modificato deve conservare la decisione presa
  -- nell'anteprima. Il contenuto completo verrà copiato solo per keep_existing.
  for v_existing_item in
    select item.*
    from public.planned_meal_items item
    join public.planned_meals meal on meal.id = item.planned_meal_id
    join public.planner_menu_packages package on package.id = meal.menu_package_id
    where item.owner_user_id = v_owner_user_id
      and item.is_user_modified is true
      and package.import_status not in ('cancelled', 'superseded')
      and (
        (package.source_type = v_source_type and package.source_external_id = v_source_external_id)
        or exists (
          select 1
          from jsonb_array_elements(v_packet -> 'days') day(value)
          cross join lateral jsonb_array_elements(day.value -> 'meals') incoming(value)
          where day.value ->> 'date' = meal.planned_date::text
            and incoming.value ->> 'slot' = meal.meal_slot
        )
      )
    order by item.id
    for update of item
  loop
    select resolution
    into v_resolution
    from jsonb_array_elements(p_resolutions) resolution
    where resolution ->> 'code' = 'user_modified_imported_item'
      and resolution ->> 'existing_item_id' = v_existing_item.id::text
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'menu_commit_conflicts_changed';
    end if;
  end loop;

  insert into public.planner_menu_packages (
    owner_user_id,
    title,
    period_start,
    period_end,
    source_type,
    source_external_id,
    source_revision,
    source_label,
    source_generated_at,
    payload_hash,
    import_status,
    confirmed_at,
    supersedes_id
  ) values (
    v_owner_user_id,
    nullif(btrim(v_menu ->> 'title'), ''),
    v_period_start,
    v_period_end,
    v_source_type,
    v_source_external_id,
    v_source_revision,
    btrim(v_source ->> 'label'),
    case
      when nullif(v_source ->> 'generated_at', '') is null then null
      else (v_source ->> 'generated_at')::timestamptz
    end,
    p_payload_hash,
    'confirmed',
    now(),
    v_supersedes_id
  )
  returning id into v_package_id;

  for v_day_index in 0..jsonb_array_length(v_packet -> 'days') - 1 loop
    v_day := v_packet -> 'days' -> v_day_index;
    if jsonb_typeof(v_day -> 'meals') <> 'array' then
      raise exception using errcode = '22023', message = 'menu_commit_contract_invalid';
    end if;

    for v_meal_index in 0..jsonb_array_length(v_day -> 'meals') - 1 loop
      v_meal := v_day -> 'meals' -> v_meal_index;
      v_incoming_meal_key := v_meal ->> 'key';
      if v_incoming_meal_key = any(v_skip_meal_keys) then
        v_meals_skipped := v_meals_skipped + 1;
        continue;
      end if;
      if jsonb_typeof(v_meal -> 'items') <> 'array' or jsonb_array_length(v_meal -> 'items') = 0 then
        raise exception using errcode = '22023', message = 'menu_commit_contract_invalid';
      end if;

      insert into public.planned_meals (
        owner_user_id,
        recipe_id,
        planned_date,
        meal_slot,
        planned_time,
        servings,
        note,
        menu_package_id,
        source_meal_key,
        is_user_modified,
        updated_at
      ) values (
        v_owner_user_id,
        null,
        (v_day ->> 'date')::date,
        v_meal ->> 'slot',
        case when nullif(v_meal ->> 'time', '') is null then null else (v_meal ->> 'time')::time end,
        case when nullif(v_meal ->> 'servings', '') is null then null else (v_meal ->> 'servings')::smallint end,
        nullif(btrim(v_meal ->> 'note'), ''),
        v_package_id,
        v_incoming_meal_key,
        false,
        now()
      )
      returning id into v_meal_id;

      v_item_position := 0;
      v_items_in_meal := 0;
      for v_item_index in 0..jsonb_array_length(v_meal -> 'items') - 1 loop
        v_item := v_meal -> 'items' -> v_item_index;
        v_item_path := format(
          'days[%s].meals[%s].items[%s]',
          v_day_index,
          v_meal_index,
          v_item_index
        );

        -- Uno skip esplicito prevale sulle altre scelte riferite allo stesso item.
        if exists (
          select 1
          from jsonb_array_elements(p_resolutions) resolution
          where resolution ->> 'action' = 'skip_incoming_item'
            and (
              resolution ->> 'path' in (v_item_path, v_item_path || '.recipe_code')
              or (
                resolution ->> 'incoming_meal_key' = v_incoming_meal_key
                and resolution ->> 'source_item_key' = v_item ->> 'key'
              )
            )
        ) then
          v_items_skipped := v_items_skipped + 1;
          continue;
        end if;

        v_item_position := v_item_position + 1;

        -- Per un elemento protetto, keep_existing copia il valore salvato e
        -- mantiene il flag di modifica manuale nella nuova revisione.
        select item.*
        into v_existing_item
        from jsonb_array_elements(p_resolutions) resolution
        join public.planned_meal_items item
          on item.id::text = resolution ->> 'existing_item_id'
         and item.owner_user_id = v_owner_user_id
        where resolution ->> 'code' = 'user_modified_imported_item'
          and resolution ->> 'action' = 'keep_existing'
          and resolution ->> 'incoming_meal_key' = v_incoming_meal_key
          and resolution ->> 'source_item_key' = v_item ->> 'key'
        limit 1;

        if found then
          insert into public.planned_meal_items (
            owner_user_id, planned_meal_id, position, item_type, recipe_id,
            recipe_code, label, quantity, unit, ingredients, procedure, note,
            source_item_key, is_user_modified, updated_at
          ) values (
            v_owner_user_id, v_meal_id, v_item_position, v_existing_item.item_type,
            v_existing_item.recipe_id, v_existing_item.recipe_code, v_existing_item.label,
            v_existing_item.quantity, v_existing_item.unit, v_existing_item.ingredients,
            v_existing_item.procedure, v_existing_item.note, v_item ->> 'key', true, now()
          );
          v_items_in_meal := v_items_in_meal + 1;
          v_items_inserted := v_items_inserted + 1;
          v_preserved_items := v_preserved_items + 1;
          continue;
        end if;

        v_recipe_id := null;
        v_recipe_code := nullif(btrim(v_item ->> 'recipe_code'), '');
        if v_item ->> 'type' = 'recipe' then
          select count(*), (array_agg(recipe.id order by recipe.id))[1]
          into v_recipe_matches, v_recipe_id
          from public.recipes recipe
          where recipe.owner_user_id = v_owner_user_id
            and upper(btrim(recipe.code)) = upper(v_recipe_code);

          if v_recipe_matches <> 1 then
            select resolution
            into v_resolution
            from jsonb_array_elements(p_resolutions) resolution
            where resolution ->> 'code' in ('missing_library_reference', 'ambiguous_library_reference')
              and resolution ->> 'path' = v_item_path || '.recipe_code'
            limit 1;

            if not found or v_resolution ->> 'action' <> 'map_recipe' then
              raise exception using errcode = 'P0001', message = 'menu_commit_library_resolution_changed';
            end if;
            begin
              v_recipe_id := (v_resolution ->> 'recipe_id')::uuid;
            exception when others then
              raise exception using errcode = '22023', message = 'menu_commit_recipe_mapping_invalid';
            end;
            if not exists (
              select 1
              from public.recipes recipe
              where recipe.id = v_recipe_id
                and recipe.owner_user_id = v_owner_user_id
            ) then
              raise exception using errcode = '42501', message = 'menu_commit_recipe_mapping_invalid';
            end if;
          end if;
        end if;

        insert into public.planned_meal_items (
          owner_user_id,
          planned_meal_id,
          position,
          item_type,
          recipe_id,
          recipe_code,
          label,
          quantity,
          unit,
          ingredients,
          procedure,
          note,
          source_item_key,
          is_user_modified,
          updated_at
        ) values (
          v_owner_user_id,
          v_meal_id,
          v_item_position,
          v_item ->> 'type',
          v_recipe_id,
          case when v_item ->> 'type' = 'recipe' then v_recipe_code else null end,
          nullif(btrim(v_item ->> 'label'), ''),
          case when v_item ? 'quantity' then (v_item ->> 'quantity')::numeric else null end,
          nullif(btrim(v_item ->> 'unit'), ''),
          case when v_item ->> 'type' = 'preparation' then v_item -> 'ingredients' else null end,
          case when v_item ->> 'type' = 'preparation' then v_item -> 'procedure' else null end,
          nullif(btrim(v_item ->> 'note'), ''),
          v_item ->> 'key',
          false,
          now()
        );
        v_items_in_meal := v_items_in_meal + 1;
        v_items_inserted := v_items_inserted + 1;
      end loop;

      if v_items_in_meal = 0 then
        delete from public.planned_meals
        where id = v_meal_id and owner_user_id = v_owner_user_id;
        v_meals_skipped := v_meals_skipped + 1;
      else
        v_meals_inserted := v_meals_inserted + 1;
      end if;
    end loop;
  end loop;

  -- I pasti protetti di un menu sostituito diventano manuali; tutti gli altri
  -- record del pacchetto sostituito vengono rimossi insieme ai relativi item.
  if cardinality(v_preserved_meal_ids) > 0 and cardinality(v_replace_package_ids) > 0 then
    update public.planned_meals
    set menu_package_id = null,
        source_meal_key = null,
        updated_at = now()
    where owner_user_id = v_owner_user_id
      and id = any(v_preserved_meal_ids)
      and menu_package_id = any(v_replace_package_ids);
  end if;

  if cardinality(v_delete_meal_ids) > 0 then
    delete from public.planned_meals
    where owner_user_id = v_owner_user_id
      and id = any(v_delete_meal_ids)
      and not (id = any(v_preserved_meal_ids));
    get diagnostics v_deleted_meals = row_count;
  end if;

  if cardinality(v_replace_package_ids) > 0 then
    delete from public.planned_meals
    where owner_user_id = v_owner_user_id
      and menu_package_id = any(v_replace_package_ids);
    get diagnostics v_affected = row_count;
    v_deleted_meals := v_deleted_meals + v_affected;

    update public.planner_menu_packages
    set import_status = 'superseded', updated_at = now()
    where owner_user_id = v_owner_user_id
      and id = any(v_replace_package_ids);
    get diagnostics v_superseded_packages = row_count;
  end if;

  return jsonb_build_object(
    'status', 'committed',
    'created', true,
    'package_id', v_package_id,
    'source_external_id', v_source_external_id,
    'source_revision', v_source_revision,
    'payload_hash', p_payload_hash,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'counts', jsonb_build_object(
      'days', jsonb_array_length(v_packet -> 'days'),
      'meals', v_meals_inserted,
      'items', v_items_inserted,
      'skipped_meals', v_meals_skipped,
      'skipped_items', v_items_skipped,
      'deleted_meals', v_deleted_meals,
      'superseded_packages', v_superseded_packages,
      'preserved_meals', cardinality(v_preserved_meal_ids),
      'preserved_items', v_preserved_items
    )
  );
exception
  when unique_violation then
    -- La funzione è atomica: qualsiasi violazione successiva annulla anche il
    -- pacchetto e tutti i pasti/item creati in precedenza.
    raise;
end;
$$;

revoke all on function public.commit_planner_menu_package(jsonb, text, text, jsonb, boolean) from public;
grant execute on function public.commit_planner_menu_package(jsonb, text, text, jsonb, boolean) to authenticated;

comment on function public.commit_planner_menu_package(jsonb, text, text, jsonb, boolean) is
  'Conferma e salva atomicamente un cucina-hub.menu-plan v1 ricontrollando hash, idempotenza, proprietà e conflitti.';

commit;

notify pgrst, 'reload schema';

select
  to_regprocedure('public.commit_planner_menu_package(jsonb,text,text,jsonb,boolean)') is not null
    as atomic_commit_rpc,
  has_function_privilege(
    'authenticated',
    'public.commit_planner_menu_package(jsonb,text,text,jsonb,boolean)',
    'EXECUTE'
  ) as authenticated_can_commit;
