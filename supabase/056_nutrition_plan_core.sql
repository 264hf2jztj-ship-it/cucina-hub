begin;

create unique index if not exists planner_menu_packages_owner_id_key
on public.planner_menu_packages(owner_user_id, id);

alter table public.planned_meals
  drop constraint if exists planned_meals_slot_allowed;

alter table public.planned_meals
  add constraint planned_meals_slot_allowed check (
    meal_slot in (
      'breakfast',
      'morning_snack',
      'lunch',
      'afternoon_snack',
      'pre_workout',
      'post_workout',
      'dinner',
      'other'
    )
  );

create table if not exists public.nutrition_plan_weeks (
  planner_menu_package_id uuid primary key,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Rome',
  measured_at date not null,
  weight_kg numeric(5,2) not null,
  waist_cm numeric(5,2) not null,
  body_fat_percent numeric(4,1),
  check_in_note text,
  goal_summary text not null,
  protein_target_min_g smallint not null,
  protein_target_max_g smallint not null,
  strategy text not null,
  source_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_plan_weeks_package_owner_fk
    foreign key (owner_user_id, planner_menu_package_id)
    references public.planner_menu_packages(owner_user_id, id)
    on delete cascade,
  constraint nutrition_plan_weeks_timezone_allowed check (
    timezone = 'Europe/Rome'
  ),
  constraint nutrition_plan_weeks_weight_range check (
    weight_kg between 20 and 400
  ),
  constraint nutrition_plan_weeks_waist_range check (
    waist_cm between 30 and 300
  ),
  constraint nutrition_plan_weeks_body_fat_range check (
    body_fat_percent is null or body_fat_percent between 1 and 75
  ),
  constraint nutrition_plan_weeks_check_in_note_length check (
    check_in_note is null or char_length(check_in_note) <= 1000
  ),
  constraint nutrition_plan_weeks_goal_summary_length check (
    char_length(btrim(goal_summary)) between 1 and 500
  ),
  constraint nutrition_plan_weeks_protein_target_range check (
    protein_target_min_g between 1 and 500
    and protein_target_max_g between protein_target_min_g and 500
  ),
  constraint nutrition_plan_weeks_strategy_length check (
    char_length(btrim(strategy)) between 1 and 2000
  ),
  constraint nutrition_plan_weeks_payload_size check (
    octet_length(source_payload::text) <= 2097152
  ),
  constraint nutrition_plan_weeks_payload_contract check (
    coalesce((
      jsonb_typeof(source_payload) = 'object'
      and source_payload @> '{"contract":"cucina-hub.nutrition-plan","version":1}'::jsonb
      and not (source_payload ? 'owner_user_id')
      and source_payload #>> '{plan,timezone}' = timezone
    ), false)
  ),
  constraint nutrition_plan_weeks_payload_days check (
    case
      when jsonb_typeof(source_payload -> 'days') = 'array'
        then jsonb_array_length(source_payload -> 'days') = 7
      else false
    end
  ),
  constraint nutrition_plan_weeks_payload_publication check (
    coalesce((
      source_payload #>> '{publication,mode}' = 'auto_if_conflict_free'
      and source_payload #>> '{publication,on_conflict}' = 'require_confirmation'
      and source_payload #> '{publication,preserve_current_on_error}' = 'true'::jsonb
    ), false)
  ),
  constraint nutrition_plan_weeks_payload_check_in check (
    coalesce((
      source_payload #>> '{check_in,measured_at}' = measured_at::text
      and source_payload #>> '{check_in,note}' is not distinct from check_in_note
      and case
        when jsonb_typeof(source_payload #> '{check_in,weight_kg}') = 'number'
          then (source_payload #>> '{check_in,weight_kg}')::numeric = weight_kg
        else false
      end
      and case
        when jsonb_typeof(source_payload #> '{check_in,waist_cm}') = 'number'
          then (source_payload #>> '{check_in,waist_cm}')::numeric = waist_cm
        else false
      end
      and case
        when body_fat_percent is null
          then coalesce(source_payload #> '{check_in,body_fat_percent}', 'null'::jsonb) = 'null'::jsonb
        when jsonb_typeof(source_payload #> '{check_in,body_fat_percent}') = 'number'
          then (source_payload #>> '{check_in,body_fat_percent}')::numeric = body_fat_percent
        else false
      end
    ), false)
  ),
  constraint nutrition_plan_weeks_payload_goal check (
    coalesce((
      source_payload #>> '{goal,summary}' = goal_summary
      and source_payload #>> '{goal,strategy}' = strategy
      and case
        when jsonb_typeof(source_payload #> '{goal,protein_target_g,min}') = 'number'
          then (source_payload #>> '{goal,protein_target_g,min}')::numeric = protein_target_min_g
        else false
      end
      and case
        when jsonb_typeof(source_payload #> '{goal,protein_target_g,max}') = 'number'
          then (source_payload #>> '{goal,protein_target_g,max}')::numeric = protein_target_max_g
        else false
      end
    ), false)
  )
);

create index if not exists nutrition_plan_weeks_owner_created_idx
on public.nutrition_plan_weeks(owner_user_id, created_at desc);

alter table public.nutrition_plan_weeks enable row level security;

revoke all on table public.nutrition_plan_weeks from anon, authenticated;
grant select on table public.nutrition_plan_weeks to authenticated;

drop policy if exists nutrition_plan_weeks_owner_select
on public.nutrition_plan_weeks;

create policy nutrition_plan_weeks_owner_select
on public.nutrition_plan_weeks
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

comment on table public.nutrition_plan_weeks is
  'Estensione privata dei pacchetti Planner per check-in, obiettivo e payload sorgente dei piani alimentari settimanali.';

comment on column public.nutrition_plan_weeks.source_payload is
  'Payload normalizzato cucina-hub.nutrition-plan v1. I pasti del Planner sono una proiezione operativa di questa fonte versionata.';

commit;

select
  to_regclass('public.nutrition_plan_weeks') as nutrition_plan_weeks,
  to_regclass('public.nutrition_plan_weeks_owner_created_idx') is not null
    as owner_history_index,
  exists (
    select 1
    from pg_constraint
    where conname = 'planned_meals_slot_allowed'
      and conrelid = 'public.planned_meals'::regclass
  ) as extended_meal_slots,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.nutrition_plan_weeks'::regclass
  ) as rls_enabled,
  has_table_privilege('authenticated', 'public.nutrition_plan_weeks', 'select')
    and not has_table_privilege('authenticated', 'public.nutrition_plan_weeks', 'insert')
    as authenticated_read_only;
