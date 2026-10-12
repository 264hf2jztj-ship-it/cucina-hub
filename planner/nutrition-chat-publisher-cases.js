"use strict";

// Fixture-only SQL harness. All mutations are enclosed in BEGIN ... ROLLBACK.
// No real measurements, user IDs, tokens or credentials are embedded.
function fixturePacket(fixture) {
  const packet = structuredClone(fixture);
  packet.plan.external_id = "nutrition-chat-test-2099-W03";
  packet.plan.title = "Fixture test — 12–18 gennaio 2099";
  packet.plan.week_start = "2099-01-12";
  packet.plan.week_end = "2099-01-18";
  packet.check_in.measured_at = "2099-01-12";
  packet.days.forEach((day, index) => {
    day.date = `2099-01-${String(12 + index).padStart(2, "0")}`;
    day.meals.forEach((meal, mealIndex) => { meal.key = `${day.date}-${meal.slot}-${mealIndex}`; });
  });
  const recipe = packet.days[0].meals.find(meal => meal.recipe_ref);
  delete recipe.recipe_ref;
  recipe.components = [{ name: "Cous cous fixture", quantity: 1, unit: "portion" }];
  return packet;
}

function invalidCases(packet) {
  const variants = [
    ["wrong_contract", value => { value.contract = "other"; }],
    ["missing_strategy", value => { delete value.goal.strategy; }],
    ["owner_forbidden", value => { value.owner_user_id = "never-accepted"; }],
    ["nested_extra", value => { value.days[0].meals[0].components[0].unexpected = true; }],
    ["empty_meal", value => { value.days[0].meals[0].components = []; }],
    ["missing_unit", value => { delete value.days[0].meals[0].components[0].unit; }],
    ["quantity_string", value => { value.days[0].meals[0].components[0].quantity = "200"; }],
    ["negative_quantity", value => { value.days[0].meals[0].components[0].quantity = -1; }],
    ["invalid_slot", value => { value.days[0].meals[0].slot = "brunch"; }],
    ["invalid_time", value => { value.days[0].meals[0].time = "25:00"; }],
    ["invalid_date", value => { value.check_in.measured_at = "2099-02-30"; }],
    ["missing_training", value => { value.days[0].training = null; }],
    ["rest_training", value => { value.days[2].training = { name: "Not rest" }; }],
    ["invalid_protein_range", value => { value.goal.protein_target_g.max = 120; }],
    ["duplicate_day", value => { value.days[1].date = value.days[0].date; }],
    ["duplicate_key", value => { value.days[0].meals[1].key = value.days[0].meals[0].key; }],
    ["duplicate_category", value => { value.shopping_list.categories.push(structuredClone(value.shopping_list.categories[0])); }],
    ["invalid_alternative", value => { value.days[0].meals[1].alternatives[0].components = []; }],
    ["unsafe_policy", value => { value.publication.preserve_current_on_error = false; }]
  ];
  return variants.map(([name, change]) => {
    const value = structuredClone(packet);
    change(value);
    return { name, packet: value };
  });
}

function sqlJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function runtimeSql(migration, packet) {
  const mutations = invalidCases(packet).map(item => `
  begin
    perform nutrition_private.validate_plan(${sqlJson(item.packet)});
    raise exception 'invalid fixture accepted: ${item.name}';
  exception when sqlstate '22023' then null;
  end;`).join("\n");
  return migration.replace(/\ncommit;\s*$/, "") + `
do $runtime$
declare
  v_packet jsonb := ${sqlJson(packet)};
  v_changed jsonb;
  v_result jsonb;
  v_package_id uuid;
  v_context jsonb;
  v_owner uuid;
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_count integer;
begin
  v_owner := nutrition_private.publisher_owner();
  v_context := nutrition_private.chat_context('2099-01-12');
  if v_context ->> 'week_end' <> '2099-01-18' then raise exception 'invalid context'; end if;
  ${mutations}
  if has_schema_privilege('authenticated', 'nutrition_private', 'usage')
     or has_function_privilege('authenticated', 'nutrition_private.publish_plan(jsonb)', 'execute')
     or has_function_privilege('anon', 'nutrition_private.publish_plan(jsonb)', 'execute')
     or has_function_privilege('service_role', 'nutrition_private.publish_plan(jsonb)', 'execute') then
    raise exception 'private bridge exposed';
  end if;

  -- Reject normal app callers, including callers with a valid app-user claim.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform nutrition_private.publish_plan(v_packet);
    raise exception 'authenticated caller accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  v_result := nutrition_private.publish_plan(v_packet);
  if v_result ->> 'status' <> 'committed' then raise exception 'first import failed'; end if;
  v_package_id := (v_result ->> 'package_id')::uuid;
  if current_user <> 'postgres'
     or coalesce(current_setting('request.jwt.claim.sub', true), '') <> coalesce(v_sub, '')
     or coalesce(current_setting('request.jwt.claims', true), '') <> coalesce(v_claims, '') then
    raise exception 'caller context not restored';
  end if;
  if not exists (select 1 from public.nutrition_plan_weeks where planner_menu_package_id = v_package_id and owner_user_id = v_owner) then
    raise exception 'wrong owner';
  end if;
  v_result := nutrition_private.publish_plan(v_packet);
  if v_result ->> 'status' <> 'already_imported' then raise exception 'retry failed'; end if;
  if v_result ->> 'active' <> 'true' then raise exception 'active retry not identified'; end if;
  v_changed := jsonb_set(v_packet, '{days,0,meals,0,components,0,unit}', '" G "');
  v_changed := jsonb_set(v_changed, '{days}', (
    select jsonb_agg(value order by position desc) from jsonb_array_elements(v_changed -> 'days') with ordinality entry(value, position)
  ));
  v_result := nutrition_private.publish_plan(v_changed);
  if v_result ->> 'status' <> 'already_imported' then raise exception 'normalized retry failed'; end if;

  -- Conflict inside the operative RPC must roll back BOTH projections.
  v_changed := jsonb_set(v_packet, '{plan,revision}', '2');
  begin
    perform nutrition_private.publish_plan(v_changed);
    raise exception 'overlap accepted without confirmation';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'menu_commit_conflicts_changed' then raise; end if;
  end;
  select count(*) into v_count from public.planner_menu_packages
    where owner_user_id = v_owner and source_external_id = v_packet #>> '{plan,external_id}';
  if v_count <> 1 then raise exception 'conflict left partial writes'; end if;
  if current_user <> 'postgres' or coalesce(current_setting('request.jwt.claim.sub', true), '') <> coalesce(v_sub, '') then
    raise exception 'error context not restored';
  end if;

  v_changed := jsonb_set(v_packet, '{goal,summary}', '"Different goal, same revision"');
  begin
    perform nutrition_private.publish_plan(v_changed);
    raise exception 'payload mismatch accepted';
  exception when unique_violation then null;
  end;

  update public.planner_menu_packages set import_status = 'superseded' where id = v_package_id;
  v_result := nutrition_private.publish_plan(v_packet);
  if v_result ->> 'status' <> 'already_imported' or v_result ->> 'active' <> 'false' then
    raise exception 'superseded retry reported as active';
  end if;

  update nutrition_private.chat_publisher_config set enabled = false where singleton;
  begin
    perform nutrition_private.publish_plan(v_packet);
    raise exception 'disabled publisher accepted';
  exception when insufficient_privilege then null;
  end;
end;
$runtime$;
rollback;
select true as bridge_validation_role_idempotency_and_rollback_ok;`;
}

module.exports = { fixturePacket, invalidCases, runtimeSql };
