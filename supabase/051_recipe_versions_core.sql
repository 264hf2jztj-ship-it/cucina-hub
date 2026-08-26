begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  version_number integer not null,
  parent_version_id uuid references public.recipe_versions(id) on delete restrict,
  source_experiment_id uuid references public.recipe_experiments(id) on delete restrict,
  label text not null,
  change_summary text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint recipe_versions_number_positive check (version_number > 0),
  constraint recipe_versions_label_valid check (char_length(btrim(label)) between 1 and 180),
  constraint recipe_versions_change_summary_valid check (change_summary is null or char_length(change_summary) <= 3000),
  constraint recipe_versions_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint recipe_versions_recipe_number_unique unique (recipe_id, version_number),
  constraint recipe_versions_recipe_id_unique unique (recipe_id, id)
);

create unique index if not exists recipe_versions_source_experiment_unique
  on public.recipe_versions(source_experiment_id)
  where source_experiment_id is not null;
create index if not exists recipe_versions_owner_recipe_idx
  on public.recipe_versions(owner_user_id, recipe_id, version_number desc);
create index if not exists recipe_versions_recipe_fk_idx on public.recipe_versions(recipe_id);
create index if not exists recipe_versions_parent_fk_idx
  on public.recipe_versions(parent_version_id)
  where parent_version_id is not null;
create index if not exists recipe_versions_experiment_fk_idx
  on public.recipe_versions(source_experiment_id)
  where source_experiment_id is not null;

create table if not exists public.recipe_version_state (
  recipe_id uuid primary key references public.recipes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  current_version_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint recipe_version_state_current_recipe_fk
    foreign key (recipe_id, current_version_id)
    references public.recipe_versions(recipe_id, id)
    on delete restrict
);

create index if not exists recipe_version_state_owner_idx
  on public.recipe_version_state(owner_user_id, updated_at desc);
create index if not exists recipe_version_state_current_fk_idx
  on public.recipe_version_state(current_version_id);

comment on table public.recipe_versions is
  'Storico immutabile delle versioni personali di una ricetta. Le versioni non sovrascrivono public.recipes.';
comment on table public.recipe_version_state is
  'Puntatore personale alla versione corrente di ogni ricetta; lo storico resta immutato.';

alter table public.recipe_versions enable row level security;
alter table public.recipe_version_state enable row level security;

revoke all on table public.recipe_versions from anon, authenticated;
revoke all on table public.recipe_version_state from anon, authenticated;
grant select on table public.recipe_versions to authenticated;
grant select on table public.recipe_version_state to authenticated;

drop policy if exists recipe_versions_owner_select on public.recipe_versions;
create policy recipe_versions_owner_select
  on public.recipe_versions for select to authenticated
  using ((select auth.uid()) = owner_user_id);

drop policy if exists recipe_version_state_owner_select on public.recipe_version_state;
create policy recipe_version_state_owner_select
  on public.recipe_version_state for select to authenticated
  using ((select auth.uid()) = owner_user_id);

create or replace function private.build_recipe_version_snapshot(
  p_recipe_id uuid,
  p_owner_user_id uuid
) returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'recipe', to_jsonb(recipe) - 'owner_user_id',
    'ingredients', coalesce((
      select jsonb_agg(to_jsonb(recipe_ingredient) order by recipe_ingredient.section_name, recipe_ingredient.sort_order, recipe_ingredient.id)
      from public.recipe_ingredients recipe_ingredient
      where recipe_ingredient.recipe_id = recipe.id
    ), '[]'::jsonb),
    'appliances', coalesce((
      select jsonb_agg(to_jsonb(recipe_appliance) order by recipe_appliance.sort_order, recipe_appliance.id)
      from public.recipe_appliances recipe_appliance
      where recipe_appliance.recipe_id = recipe.id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(recipe_category) order by recipe_category.sort_order, recipe_category.category_id)
      from public.recipe_categories recipe_category
      where recipe_category.recipe_id = recipe.id
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(to_jsonb(recipe_tag) order by recipe_tag.tag_id)
      from public.recipe_tags recipe_tag
      where recipe_tag.recipe_id = recipe.id
    ), '[]'::jsonb),
    'applied_changes', '[]'::jsonb
  )
  from public.recipes recipe
  where recipe.id = p_recipe_id
    and recipe.owner_user_id = p_owner_user_id;
$$;

revoke all on function private.build_recipe_version_snapshot(uuid, uuid) from public, anon, authenticated;

create or replace function public.ensure_recipe_baseline(p_recipe_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version_id uuid;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Accesso richiesto';
  end if;

  perform 1
  from public.recipes recipe
  where recipe.id = p_recipe_id
    and recipe.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Ricetta non trovata o non autorizzata';
  end if;

  select state.current_version_id
  into v_current_version_id
  from public.recipe_version_state state
  where state.recipe_id = p_recipe_id
    and state.owner_user_id = v_user_id;

  if v_current_version_id is not null then
    return v_current_version_id;
  end if;

  v_snapshot := private.build_recipe_version_snapshot(p_recipe_id, v_user_id);
  if v_snapshot is null then
    raise exception 'Impossibile creare lo snapshot della ricetta';
  end if;

  insert into public.recipe_versions (
    owner_user_id, recipe_id, version_number, label, change_summary, snapshot
  ) values (
    v_user_id, p_recipe_id, 1, 'Versione originale',
    'Snapshot iniziale della ricetta prima delle modifiche sperimentali.', v_snapshot
  ) returning id into v_current_version_id;

  insert into public.recipe_version_state (
    recipe_id, owner_user_id, current_version_id
  ) values (
    p_recipe_id, v_user_id, v_current_version_id
  );

  return v_current_version_id;
end;
$$;

create or replace function public.promote_recipe_experiment(
  p_experiment_id uuid,
  p_label text default null,
  p_change_summary text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_experiment public.recipe_experiments%rowtype;
  v_existing_version_id uuid;
  v_parent_version_id uuid;
  v_parent_snapshot jsonb;
  v_version_number integer;
  v_version_id uuid;
  v_label text;
  v_summary text;
  v_change jsonb;
begin
  if v_user_id is null then
    raise exception 'Accesso richiesto';
  end if;

  select experiment.*
  into v_experiment
  from public.recipe_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.owner_user_id = v_user_id;

  if not found then
    raise exception 'Esperimento non trovato o non autorizzato';
  end if;
  if v_experiment.status <> 'completed' or v_experiment.outcome <> 'improved' then
    raise exception 'Puoi promuovere solo un esperimento concluso con esito Migliorato';
  end if;

  perform 1
  from public.recipes recipe
  where recipe.id = v_experiment.recipe_id
    and recipe.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Ricetta non trovata o non autorizzata';
  end if;

  select version.id
  into v_existing_version_id
  from public.recipe_versions version
  where version.source_experiment_id = p_experiment_id
    and version.owner_user_id = v_user_id;

  if v_existing_version_id is not null then
    return v_existing_version_id;
  end if;

  perform public.ensure_recipe_baseline(v_experiment.recipe_id);

  select state.current_version_id, version.snapshot
  into v_parent_version_id, v_parent_snapshot
  from public.recipe_version_state state
  join public.recipe_versions version on version.id = state.current_version_id
  where state.recipe_id = v_experiment.recipe_id
    and state.owner_user_id = v_user_id;

  select coalesce(max(version.version_number), 0) + 1
  into v_version_number
  from public.recipe_versions version
  where version.recipe_id = v_experiment.recipe_id
    and version.owner_user_id = v_user_id;

  v_label := coalesce(nullif(btrim(p_label), ''), 'v' || v_version_number || ' · ' || v_experiment.variable_name);
  v_summary := coalesce(nullif(btrim(p_change_summary), ''), v_experiment.change_description);
  if char_length(v_label) > 180 then
    raise exception 'Il nome della versione supera 180 caratteri';
  end if;
  if char_length(v_summary) > 3000 then
    raise exception 'Il riepilogo della modifica supera 3000 caratteri';
  end if;

  v_change := jsonb_build_object(
    'experiment_id', v_experiment.id,
    'variable_name', v_experiment.variable_name,
    'change_description', v_experiment.change_description,
    'result_notes', v_experiment.result_notes,
    'rating', v_experiment.rating,
    'promoted_at', now()
  );
  v_parent_snapshot := jsonb_set(
    v_parent_snapshot,
    '{applied_changes}',
    coalesce(v_parent_snapshot->'applied_changes', '[]'::jsonb) || jsonb_build_array(v_change),
    true
  );

  insert into public.recipe_versions (
    owner_user_id, recipe_id, version_number, parent_version_id,
    source_experiment_id, label, change_summary, snapshot
  ) values (
    v_user_id, v_experiment.recipe_id, v_version_number, v_parent_version_id,
    v_experiment.id, v_label, v_summary, v_parent_snapshot
  ) returning id into v_version_id;

  update public.recipe_version_state
  set current_version_id = v_version_id,
      updated_at = now()
  where recipe_id = v_experiment.recipe_id
    and owner_user_id = v_user_id;

  return v_version_id;
end;
$$;

create or replace function public.set_current_recipe_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipe_id uuid;
begin
  if v_user_id is null then
    raise exception 'Accesso richiesto';
  end if;

  select version.recipe_id
  into v_recipe_id
  from public.recipe_versions version
  where version.id = p_version_id
    and version.owner_user_id = v_user_id;

  if v_recipe_id is null then
    raise exception 'Versione non trovata o non autorizzata';
  end if;

  update public.recipe_version_state
  set current_version_id = p_version_id,
      updated_at = now()
  where recipe_id = v_recipe_id
    and owner_user_id = v_user_id;

  if not found then
    raise exception 'Stato versione non trovato';
  end if;

  return p_version_id;
end;
$$;

revoke all on function public.ensure_recipe_baseline(uuid) from public, anon;
revoke all on function public.promote_recipe_experiment(uuid, text, text) from public, anon;
revoke all on function public.set_current_recipe_version(uuid) from public, anon;
grant execute on function public.ensure_recipe_baseline(uuid) to authenticated;
grant execute on function public.promote_recipe_experiment(uuid, text, text) to authenticated;
grant execute on function public.set_current_recipe_version(uuid) to authenticated;

commit;
