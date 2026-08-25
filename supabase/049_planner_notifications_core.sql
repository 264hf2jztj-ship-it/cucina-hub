begin;

create extension if not exists pgcrypto;

create table if not exists public.planner_notification_preferences (
  owner_user_id uuid primary key default auth.uid(),
  meals_enabled boolean not null default true,
  meal_lead_minutes smallint not null default 60,
  meal_prep_enabled boolean not null default true,
  meal_prep_lead_minutes smallint not null default 30,
  system_notifications_enabled boolean not null default false,
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_notification_preferences_meal_lead_range check (
    meal_lead_minutes between 0 and 1440
  ),
  constraint planner_notification_preferences_prep_lead_range check (
    meal_prep_lead_minutes between 0 and 1440
  ),
  constraint planner_notification_preferences_timezone_length check (
    char_length(trim(timezone)) between 1 and 100
  )
);

create table if not exists public.planner_notification_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  source_type text not null,
  source_id uuid not null,
  source_updated_at timestamptz not null,
  status text not null default 'unread',
  notified_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_notification_states_source_type_allowed check (
    source_type in ('planned_meal', 'meal_prep_task')
  ),
  constraint planner_notification_states_status_allowed check (
    status in ('unread', 'read', 'dismissed')
  ),
  constraint planner_notification_states_source_unique unique (
    owner_user_id,
    source_type,
    source_id
  )
);

create index if not exists planner_notification_states_owner_status_idx
on public.planner_notification_states(owner_user_id, status, updated_at desc);

create index if not exists planner_notification_states_owner_source_idx
on public.planner_notification_states(owner_user_id, source_type, source_id);

create or replace function public.planner_notifications_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();

  if tg_table_name = 'planner_notification_states' then
    if new.status = 'read' and old.status is distinct from 'read' then
      new.read_at = now();
      new.dismissed_at = null;
    elsif new.status = 'dismissed' and old.status is distinct from 'dismissed' then
      new.dismissed_at = now();
      new.read_at = null;
    elsif new.status = 'unread' then
      new.read_at = null;
      new.dismissed_at = null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.planner_notifications_touch_updated_at() from public;
revoke all on function public.planner_notifications_touch_updated_at() from anon;
revoke all on function public.planner_notifications_touch_updated_at() from authenticated;

drop trigger if exists planner_notification_preferences_touch_updated_at
on public.planner_notification_preferences;

create trigger planner_notification_preferences_touch_updated_at
before update on public.planner_notification_preferences
for each row
execute function public.planner_notifications_touch_updated_at();

drop trigger if exists planner_notification_states_touch_updated_at
on public.planner_notification_states;

create trigger planner_notification_states_touch_updated_at
before update on public.planner_notification_states
for each row
execute function public.planner_notifications_touch_updated_at();

alter table public.planner_notification_preferences enable row level security;
alter table public.planner_notification_states enable row level security;

drop policy if exists planner_notification_preferences_owner_select
on public.planner_notification_preferences;
create policy planner_notification_preferences_owner_select
on public.planner_notification_preferences
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_preferences_owner_insert
on public.planner_notification_preferences;
create policy planner_notification_preferences_owner_insert
on public.planner_notification_preferences
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_preferences_owner_update
on public.planner_notification_preferences;
create policy planner_notification_preferences_owner_update
on public.planner_notification_preferences
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_preferences_owner_delete
on public.planner_notification_preferences;
create policy planner_notification_preferences_owner_delete
on public.planner_notification_preferences
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_states_owner_select
on public.planner_notification_states;
create policy planner_notification_states_owner_select
on public.planner_notification_states
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_states_owner_insert
on public.planner_notification_states;
create policy planner_notification_states_owner_insert
on public.planner_notification_states
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_states_owner_update
on public.planner_notification_states;
create policy planner_notification_states_owner_update
on public.planner_notification_states
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists planner_notification_states_owner_delete
on public.planner_notification_states;
create policy planner_notification_states_owner_delete
on public.planner_notification_states
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on table public.planner_notification_preferences from public;
revoke all on table public.planner_notification_preferences from anon;
revoke all on table public.planner_notification_states from public;
revoke all on table public.planner_notification_states from anon;

grant select, insert, update, delete
on table public.planner_notification_preferences
to authenticated;

grant select, insert, update, delete
on table public.planner_notification_states
to authenticated;

commit;

select
  to_regclass('public.planner_notification_preferences') is not null
    as notification_preferences_table,
  to_regclass('public.planner_notification_states') is not null
    as notification_states_table,
  coalesce((
    select relrowsecurity
    from pg_class
    where oid = 'public.planner_notification_preferences'::regclass
  ), false) as preferences_rls_enabled,
  coalesce((
    select relrowsecurity
    from pg_class
    where oid = 'public.planner_notification_states'::regclass
  ), false) as states_rls_enabled,
  has_table_privilege(
    'authenticated',
    'public.planner_notification_preferences',
    'select,insert,update,delete'
  ) as authenticated_preferences_access,
  has_table_privilege(
    'authenticated',
    'public.planner_notification_states',
    'select,insert,update,delete'
  ) as authenticated_states_access;
