begin;

create extension if not exists pgcrypto;

create table if not exists public.baking_session_notes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  session_id uuid not null references public.baking_sessions(id) on delete cascade,
  phase_key text not null default 'general',
  note_kind text not null default 'observation',
  note_text text not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint baking_session_notes_phase_allowed check (
    phase_key in (
      'general',
      'preparation',
      'mixing',
      'bulk',
      'cold',
      'shaping',
      'proof',
      'baking',
      'result'
    )
  ),
  constraint baking_session_notes_kind_allowed check (
    note_kind in ('observation','change','problem','idea')
  ),
  constraint baking_session_notes_text_valid check (
    char_length(btrim(note_text)) between 1 and 5000
  )
);

create index if not exists baking_session_notes_session_observed_idx
on public.baking_session_notes(session_id, observed_at desc, created_at desc);

create index if not exists baking_session_notes_owner_updated_idx
on public.baking_session_notes(owner_user_id, updated_at desc);

alter table public.baking_session_notes enable row level security;

drop policy if exists baking_session_notes_owner_select on public.baking_session_notes;
create policy baking_session_notes_owner_select
on public.baking_session_notes
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
);

drop policy if exists baking_session_notes_owner_insert on public.baking_session_notes;
create policy baking_session_notes_owner_insert
on public.baking_session_notes
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
);

drop policy if exists baking_session_notes_owner_update on public.baking_session_notes;
create policy baking_session_notes_owner_update
on public.baking_session_notes
for update
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

drop policy if exists baking_session_notes_owner_delete on public.baking_session_notes;
create policy baking_session_notes_owner_delete
on public.baking_session_notes
for delete
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.baking_sessions session
    where session.id = session_id
      and session.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete
on public.baking_session_notes
to authenticated;

commit;

select
  to_regclass('public.baking_session_notes') as baking_session_notes,
  exists (
    select 1
    from pg_constraint
    where conname = 'baking_session_notes_text_valid'
  ) as text_constraint_present,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'baking_session_notes'
  ) as rls_policy_count;
