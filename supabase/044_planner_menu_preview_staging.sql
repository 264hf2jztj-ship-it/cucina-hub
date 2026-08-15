begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.planner_menu_packages') is null then
    raise exception 'planner_menu_migration_041_required';
  end if;

  if to_regprocedure('public.commit_planner_menu_package(jsonb,text,text,jsonb,boolean)') is null then
    raise exception 'planner_menu_migration_042_required';
  end if;
end;
$$;

create table if not exists public.planner_menu_import_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  source_type text not null,
  source_external_id text not null,
  source_revision integer not null,
  source_label text not null,
  title text,
  period_start date not null,
  period_end date not null,
  payload_hash text not null,
  packet jsonb not null,
  status text not null default 'pending',
  opened_at timestamptz,
  resolved_at timestamptz,
  committed_package_id uuid references public.planner_menu_packages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_menu_import_requests_source_type_allowed check (
    source_type = 'chatgpt_project'
  ),
  constraint planner_menu_import_requests_external_id_length check (
    char_length(source_external_id) between 1 and 160
  ),
  constraint planner_menu_import_requests_revision_positive check (
    source_revision >= 1
  ),
  constraint planner_menu_import_requests_source_label_length check (
    char_length(source_label) between 1 and 200
  ),
  constraint planner_menu_import_requests_title_length check (
    title is null or char_length(title) <= 240
  ),
  constraint planner_menu_import_requests_period_valid check (
    period_end >= period_start
  ),
  constraint planner_menu_import_requests_hash_format check (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint planner_menu_import_requests_packet_size check (
    octet_length(packet::text) <= 2097152
  ),
  constraint planner_menu_import_requests_contract_guardrails check (
    jsonb_typeof(packet) = 'object'
    and packet ->> 'contract' = 'cucina-hub.menu-plan'
    and packet ->> 'version' = '1'
    and packet #>> '{guardrails,preview_only}' = 'true'
    and packet #>> '{guardrails,automatic_save}' = 'false'
    and packet #>> '{guardrails,requires_user_confirmation}' = 'true'
    and jsonb_typeof(packet -> 'days') = 'array'
    and not (packet ? 'owner_user_id')
  ),
  constraint planner_menu_import_requests_identity_matches_packet check (
    source_type = packet #>> '{menu,source,type}'
    and source_external_id = btrim(packet #>> '{menu,external_id}')
    and source_revision::text = packet #>> '{menu,revision}'
    and source_label = btrim(packet #>> '{menu,source,label}')
    and period_start::text = packet #>> '{menu,period_start}'
    and period_end::text = packet #>> '{menu,period_end}'
    and title is not distinct from nullif(btrim(packet #>> '{menu,title}'), '')
  ),
  constraint planner_menu_import_requests_status_allowed check (
    status in ('pending', 'opened', 'committed', 'cancelled')
  ),
  constraint planner_menu_import_requests_status_shape check (
    (status = 'committed' and resolved_at is not null)
    or (status = 'cancelled' and committed_package_id is null and resolved_at is not null)
    or (status in ('pending', 'opened') and committed_package_id is null and resolved_at is null)
  )
);

create unique index if not exists planner_menu_import_requests_owner_source_revision_key
on public.planner_menu_import_requests (
  owner_user_id,
  source_type,
  source_external_id,
  source_revision
);

create index if not exists planner_menu_import_requests_owner_status_created_idx
on public.planner_menu_import_requests(owner_user_id, status, created_at desc);

alter table public.planner_menu_import_requests enable row level security;

drop policy if exists planner_menu_import_requests_owner_select
on public.planner_menu_import_requests;
create policy planner_menu_import_requests_owner_select
on public.planner_menu_import_requests
for select
using (owner_user_id = auth.uid());

revoke all on public.planner_menu_import_requests from anon, authenticated;
grant select on public.planner_menu_import_requests to authenticated;

create or replace function public.stage_planner_menu_preview(
  p_packet jsonb,
  p_canonical_payload text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
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
  v_source_label text;
  v_title text;
  v_period_start date;
  v_period_end date;
  v_verified_hash text;
  v_existing_request public.planner_menu_import_requests%rowtype;
  v_existing_package public.planner_menu_packages%rowtype;
  v_request public.planner_menu_import_requests%rowtype;
  v_day jsonb;
  v_day_date date;
  v_meal jsonb;
  v_days integer := 0;
  v_meals integer := 0;
  v_items integer := 0;
begin
  if v_owner_user_id is null then
    raise exception using errcode = '42501', message = 'menu_preview_auth_required';
  end if;

  if jsonb_typeof(p_packet) <> 'object'
     or p_canonical_payload is null
     or octet_length(p_canonical_payload) > 2097152 then
    raise exception using errcode = '22023', message = 'menu_preview_invalid_request';
  end if;

  begin
    v_packet := p_canonical_payload::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'menu_preview_invalid_canonical_payload';
  end;

  if v_packet <> p_packet then
    raise exception using errcode = '22023', message = 'menu_preview_payload_mismatch';
  end if;

  v_verified_hash := encode(digest(convert_to(p_canonical_payload, 'UTF8'), 'sha256'), 'hex');
  if p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload_hash <> v_verified_hash then
    raise exception using errcode = '22023', message = 'menu_preview_hash_mismatch';
  end if;

  if v_packet ->> 'contract' <> 'cucina-hub.menu-plan'
     or v_packet ->> 'version' <> '1'
     or v_packet #>> '{guardrails,preview_only}' <> 'true'
     or v_packet #>> '{guardrails,automatic_save}' <> 'false'
     or v_packet #>> '{guardrails,requires_user_confirmation}' <> 'true'
     or jsonb_typeof(v_packet -> 'days') <> 'array'
     or v_packet ? 'owner_user_id' then
    raise exception using errcode = '22023', message = 'menu_preview_contract_invalid';
  end if;

  v_menu := v_packet -> 'menu';
  v_source := v_menu -> 'source';
  if jsonb_typeof(v_menu) <> 'object' or jsonb_typeof(v_source) <> 'object' then
    raise exception using errcode = '22023', message = 'menu_preview_contract_invalid';
  end if;

  v_source_type := btrim(v_source ->> 'type');
  v_source_external_id := btrim(v_menu ->> 'external_id');
  v_source_label := btrim(v_source ->> 'label');
  v_title := nullif(btrim(v_menu ->> 'title'), '');

  begin
    v_source_revision := (v_menu ->> 'revision')::integer;
    v_period_start := (v_menu ->> 'period_start')::date;
    v_period_end := (v_menu ->> 'period_end')::date;
  exception when others then
    raise exception using errcode = '22023', message = 'menu_preview_identity_invalid';
  end;

  if v_source_type <> 'chatgpt_project'
     or v_source_external_id is null
     or char_length(v_source_external_id) not between 1 and 160
     or v_source_revision < 1
     or v_period_end < v_period_start
     or v_source_label is null
     or char_length(v_source_label) not between 1 and 200
     or (v_title is not null and char_length(v_title) > 240) then
    raise exception using errcode = '22023', message = 'menu_preview_identity_invalid';
  end if;

  for v_day in select value from jsonb_array_elements(v_packet -> 'days')
  loop
    if jsonb_typeof(v_day) <> 'object'
       or jsonb_typeof(v_day -> 'meals') <> 'array' then
      raise exception using errcode = '22023', message = 'menu_preview_days_invalid';
    end if;

    begin
      v_day_date := (v_day ->> 'date')::date;
    exception when others then
      raise exception using errcode = '22023', message = 'menu_preview_days_invalid';
    end;

    if v_day_date < v_period_start or v_day_date > v_period_end then
      raise exception using errcode = '22023', message = 'menu_preview_day_outside_period';
    end if;

    v_days := v_days + 1;
    v_meals := v_meals + jsonb_array_length(v_day -> 'meals');
    for v_meal in select value from jsonb_array_elements(v_day -> 'meals')
    loop
      if jsonb_typeof(v_meal) <> 'object'
         or jsonb_typeof(v_meal -> 'items') <> 'array'
         or jsonb_array_length(v_meal -> 'items') = 0 then
        raise exception using errcode = '22023', message = 'menu_preview_meals_invalid';
      end if;
      v_items := v_items + jsonb_array_length(v_meal -> 'items');
    end loop;
  end loop;

  -- Usa la stessa serratura del commit atomico: staging e conferma della stessa
  -- persona non possono osservare due stati diversi della medesima identità.
  perform pg_advisory_xact_lock(hashtextextended('planner-menu:' || v_owner_user_id::text, 0));

  select request.*
  into v_existing_request
  from public.planner_menu_import_requests request
  where request.owner_user_id = v_owner_user_id
    and request.source_type = v_source_type
    and request.source_external_id = v_source_external_id
    and request.source_revision = v_source_revision
  for update;

  select package.*
  into v_existing_package
  from public.planner_menu_packages package
  where package.owner_user_id = v_owner_user_id
    and package.source_type = v_source_type
    and package.source_external_id = v_source_external_id
    and package.source_revision = v_source_revision
  for update;

  if v_existing_request.id is not null
     and v_existing_request.payload_hash <> p_payload_hash then
    raise exception using errcode = '23505', message = 'menu_preview_same_revision_payload_mismatch';
  end if;

  if v_existing_package.id is not null then
    if v_existing_package.payload_hash is distinct from p_payload_hash then
      raise exception using errcode = '23505', message = 'menu_preview_same_revision_payload_mismatch';
    end if;

    if v_existing_request.id is null then
      insert into public.planner_menu_import_requests (
        owner_user_id,
        source_type,
        source_external_id,
        source_revision,
        source_label,
        title,
        period_start,
        period_end,
        payload_hash,
        packet,
        status,
        resolved_at,
        committed_package_id
      ) values (
        v_owner_user_id,
        v_source_type,
        v_source_external_id,
        v_source_revision,
        v_source_label,
        v_title,
        v_period_start,
        v_period_end,
        p_payload_hash,
        v_packet,
        'committed',
        coalesce(v_existing_package.confirmed_at, now()),
        v_existing_package.id
      )
      returning * into v_request;
    else
      update public.planner_menu_import_requests
      set status = 'committed',
          resolved_at = coalesce(v_existing_package.confirmed_at, now()),
          committed_package_id = v_existing_package.id,
          updated_at = now()
      where id = v_existing_request.id
      returning * into v_request;
    end if;

    return jsonb_build_object(
      'status', 'already_committed',
      'created', false,
      'request_id', v_request.id,
      'package_id', v_existing_package.id,
      'payload_hash', p_payload_hash,
      'summary', jsonb_build_object('days', v_days, 'meals', v_meals, 'items', v_items),
      'preview_only', true,
      'requires_user_confirmation', true
    );
  end if;

  if v_existing_request.id is not null then
    if v_existing_request.status = 'cancelled' then
      update public.planner_menu_import_requests
      set status = 'pending',
          opened_at = null,
          resolved_at = null,
          committed_package_id = null,
          updated_at = now()
      where id = v_existing_request.id
      returning * into v_request;
    else
      v_request := v_existing_request;
    end if;

    return jsonb_build_object(
      'status', case when v_existing_request.status = 'cancelled' then 'reopened' else 'already_staged' end,
      'created', false,
      'request_id', v_request.id,
      'payload_hash', p_payload_hash,
      'summary', jsonb_build_object('days', v_days, 'meals', v_meals, 'items', v_items),
      'preview_only', true,
      'requires_user_confirmation', true
    );
  end if;

  insert into public.planner_menu_import_requests (
    owner_user_id,
    source_type,
    source_external_id,
    source_revision,
    source_label,
    title,
    period_start,
    period_end,
    payload_hash,
    packet,
    status
  ) values (
    v_owner_user_id,
    v_source_type,
    v_source_external_id,
    v_source_revision,
    v_source_label,
    v_title,
    v_period_start,
    v_period_end,
    p_payload_hash,
    v_packet,
    'pending'
  )
  returning * into v_request;

  return jsonb_build_object(
    'status', 'staged',
    'created', true,
    'request_id', v_request.id,
    'payload_hash', p_payload_hash,
    'summary', jsonb_build_object('days', v_days, 'meals', v_meals, 'items', v_items),
    'preview_only', true,
    'requires_user_confirmation', true
  );
end;
$$;

revoke all on function public.stage_planner_menu_preview(jsonb, text, text) from public;
grant execute on function public.stage_planner_menu_preview(jsonb, text, text) to authenticated;

create or replace function public.update_planner_menu_preview_request(
  p_request_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_request public.planner_menu_import_requests%rowtype;
begin
  if v_owner_user_id is null then
    raise exception using errcode = '42501', message = 'menu_preview_auth_required';
  end if;

  if p_action not in ('open', 'cancel') then
    raise exception using errcode = '22023', message = 'menu_preview_action_invalid';
  end if;

  select request.*
  into v_request
  from public.planner_menu_import_requests request
  where request.id = p_request_id
    and request.owner_user_id = v_owner_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'menu_preview_request_not_found';
  end if;

  if v_request.status = 'committed' then
    raise exception using errcode = 'P0001', message = 'menu_preview_already_committed';
  end if;

  if p_action = 'open' then
    if v_request.status = 'cancelled' then
      raise exception using errcode = 'P0001', message = 'menu_preview_cancelled';
    end if;

    update public.planner_menu_import_requests
    set status = 'opened',
        opened_at = coalesce(opened_at, now()),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    update public.planner_menu_import_requests
    set status = 'cancelled',
        resolved_at = now(),
        committed_package_id = null,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'updated_at', v_request.updated_at
  );
end;
$$;

revoke all on function public.update_planner_menu_preview_request(uuid, text) from public;
grant execute on function public.update_planner_menu_preview_request(uuid, text) to authenticated;

create or replace function public.planner_menu_import_request_mark_committed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.planner_menu_import_requests
  set status = 'committed',
      resolved_at = coalesce(new.confirmed_at, now()),
      committed_package_id = new.id,
      updated_at = now()
  where owner_user_id = new.owner_user_id
    and source_type = new.source_type
    and source_external_id = new.source_external_id
    and source_revision = new.source_revision
    and payload_hash = new.payload_hash
    and status in ('pending', 'opened');

  return new;
end;
$$;

revoke all on function public.planner_menu_import_request_mark_committed() from public;

drop trigger if exists planner_menu_import_request_commit_sync
on public.planner_menu_packages;
create trigger planner_menu_import_request_commit_sync
after insert or update of import_status, payload_hash, confirmed_at
on public.planner_menu_packages
for each row
when (new.import_status = 'confirmed' and new.payload_hash is not null)
execute function public.planner_menu_import_request_mark_committed();

comment on table public.planner_menu_import_requests is
  'Richieste personali ricevute dall endpoint ChatGPT: conservano soltanto un pacchetto in staging finche l utente non lo conferma nel Planner.';

comment on function public.stage_planner_menu_preview(jsonb, text, text) is
  'Valida identita, guardrail, hash e retry di un menu-plan v1 autenticato e crea soltanto una richiesta di anteprima personale.';

comment on function public.update_planner_menu_preview_request(uuid, text) is
  'Apre o annulla una richiesta di anteprima personale senza attivare alcun menu.';

commit;

notify pgrst, 'reload schema';

select
  to_regclass('public.planner_menu_import_requests') as preview_staging_table,
  to_regprocedure('public.stage_planner_menu_preview(jsonb,text,text)') as preview_staging_rpc,
  to_regprocedure('public.update_planner_menu_preview_request(uuid,text)') as preview_action_rpc,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.planner_menu_import_requests'::regclass
  ) as staging_rls_enabled,
  has_table_privilege('authenticated', 'public.planner_menu_import_requests', 'SELECT')
    as authenticated_can_read_own_requests,
  not has_table_privilege('authenticated', 'public.planner_menu_import_requests', 'INSERT')
    and not has_table_privilege('authenticated', 'public.planner_menu_import_requests', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.planner_menu_import_requests', 'DELETE')
    as direct_mutations_blocked,
  has_function_privilege(
    'authenticated',
    'public.stage_planner_menu_preview(jsonb,text,text)',
    'EXECUTE'
  ) as authenticated_can_stage;
