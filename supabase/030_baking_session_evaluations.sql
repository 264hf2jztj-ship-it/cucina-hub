begin;

create extension if not exists pgcrypto;

create table if not exists public.baking_session_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  session_id uuid not null references public.baking_sessions(id) on delete cascade,
  evaluation_version smallint not null default 1,
  overall_rating smallint not null,
  fermentation_outcome text not null,
  fermentation_rating smallint not null,
  workability_rating smallint not null,
  structure_rating smallint not null,
  crispness_rating smallint not null,
  softness_rating smallint not null,
  digestibility_rating smallint not null,
  would_repeat boolean,
  actual_bulk_minutes integer,
  actual_cold_minutes integer,
  actual_proof_minutes integer,
  changes_made text,
  result_notes text,
  next_time_notes text,
  planned_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint baking_session_evaluations_session_unique unique (session_id),
  constraint baking_session_evaluations_version_valid check (evaluation_version >= 1),
  constraint baking_session_evaluations_overall_valid check (overall_rating between 1 and 5),
  constraint baking_session_evaluations_outcome_allowed check (
    fermentation_outcome in ('underfermented','balanced','overfermented','uncertain')
  ),
  constraint baking_session_evaluations_fermentation_valid check (fermentation_rating between 1 and 5),
  constraint baking_session_evaluations_workability_valid check (workability_rating between 1 and 5),
  constraint baking_session_evaluations_structure_valid check (structure_rating between 1 and 5),
  constraint baking_session_evaluations_crispness_valid check (crispness_rating between 1 and 5),
  constraint baking_session_evaluations_softness_valid check (softness_rating between 1 and 5),
  constraint baking_session_evaluations_digestibility_valid check (digestibility_rating between 1 and 5),
  constraint baking_session_evaluations_actual_bulk_valid check (actual_bulk_minutes is null or actual_bulk_minutes >= 0),
  constraint baking_session_evaluations_actual_cold_valid check (actual_cold_minutes is null or actual_cold_minutes >= 0),
  constraint baking_session_evaluations_actual_proof_valid check (actual_proof_minutes is null or actual_proof_minutes >= 0)
);

create index if not exists baking_session_evaluations_owner_updated_idx
on public.baking_session_evaluations(owner_user_id, updated_at desc);

alter table public.baking_session_evaluations enable row level security;

drop policy if exists baking_session_evaluations_owner_all on public.baking_session_evaluations;
create policy baking_session_evaluations_owner_all
on public.baking_session_evaluations
for all
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete
on public.baking_session_evaluations
to authenticated;

commit;

select
  to_regclass('public.baking_session_evaluations') as baking_session_evaluations,
  exists (
    select 1
    from pg_constraint
    where conname = 'baking_session_evaluations_session_unique'
  ) as one_evaluation_per_session;
