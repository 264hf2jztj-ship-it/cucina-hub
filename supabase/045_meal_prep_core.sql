begin;

create extension if not exists pgcrypto;

create table if not exists public.meal_prep_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  planned_meal_id uuid not null
    references public.planned_meals(id) on delete cascade,
  planned_meal_item_id uuid
    references public.planned_meal_items(id) on delete set null,
  task_type text not null default 'prepare',
  title text not null,
  scheduled_date date not null,
  scheduled_time time without time zone,
  servings smallint,
  quantity numeric(12, 3),
  unit text,
  storage_method text not null default 'none',
  storage_note text,
  note text,
  status text not null default 'todo',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_prep_tasks_type_allowed check (
    task_type in ('prepare', 'cook', 'portion', 'store', 'defrost', 'other')
  ),
  constraint meal_prep_tasks_status_allowed check (
    status in ('todo', 'in_progress', 'done')
  ),
  constraint meal_prep_tasks_storage_allowed check (
    storage_method in ('none', 'refrigerator', 'freezer', 'room_temperature', 'other')
  ),
  constraint meal_prep_tasks_title_length check (
    char_length(trim(title)) between 1 and 200
  ),
  constraint meal_prep_tasks_servings_range check (
    servings is null or servings between 1 and 50
  ),
  constraint meal_prep_tasks_quantity_positive check (
    quantity is null or quantity > 0
  ),
  constraint meal_prep_tasks_quantity_unit_shape check (
    (quantity is null and unit is null)
    or (
      quantity is not null
      and unit is not null
      and char_length(trim(unit)) between 1 and 40
    )
  ),
  constraint meal_prep_tasks_storage_note_length check (
    storage_note is null or char_length(storage_note) <= 500
  ),
  constraint meal_prep_tasks_note_length check (
    note is null or char_length(note) <= 2000
  )
);

create index if not exists meal_prep_tasks_owner_meal_idx
on public.meal_prep_tasks(owner_user_id, planned_meal_id, status);

create index if not exists meal_prep_tasks_owner_schedule_idx
on public.meal_prep_tasks(
  owner_user_id,
  scheduled_date,
  scheduled_time,
  status
);

create index if not exists meal_prep_tasks_owner_item_idx
on public.meal_prep_tasks(owner_user_id, planned_meal_item_id)
where planned_meal_item_id is not null;

create or replace function public.meal_prep_tasks_validate_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_meal_date date;
begin
  select meal.planned_date
    into linked_meal_date
  from public.planned_meals meal
  where meal.id = new.planned_meal_id
    and meal.owner_user_id = new.owner_user_id;

  if linked_meal_date is null then
    raise exception using
      errcode = '23503',
      message = 'planned_meal_id must reference a meal owned by the same user';
  end if;

  if new.planned_meal_item_id is not null
     and not exists (
       select 1
       from public.planned_meal_items item
       where item.id = new.planned_meal_item_id
         and item.planned_meal_id = new.planned_meal_id
         and item.owner_user_id = new.owner_user_id
     ) then
    raise exception using
      errcode = '23503',
      message = 'planned_meal_item_id must belong to the linked meal and user';
  end if;

  if new.scheduled_date > linked_meal_date then
    raise exception using
      errcode = '23514',
      message = 'meal prep cannot be scheduled after the linked meal';
  end if;

  if new.status = 'done' then
    if tg_op = 'INSERT' then
      new.completed_at = now();
    elsif old.status is distinct from 'done' then
      new.completed_at = now();
    else
      new.completed_at = old.completed_at;
    end if;
  else
    new.completed_at = null;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.meal_prep_tasks_validate_link() from public;

drop trigger if exists meal_prep_tasks_link_guard
on public.meal_prep_tasks;

create trigger meal_prep_tasks_link_guard
before insert or update
on public.meal_prep_tasks
for each row
execute function public.meal_prep_tasks_validate_link();

create or replace function public.meal_prep_tasks_validate_meal_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.planned_date is distinct from old.planned_date
     and exists (
       select 1
       from public.meal_prep_tasks task
       where task.planned_meal_id = new.id
         and task.owner_user_id = new.owner_user_id
         and task.scheduled_date > new.planned_date
     ) then
    raise exception using
      errcode = '23514',
      message = 'linked meal cannot be moved before an existing meal prep task';
  end if;

  return new;
end;
$$;

revoke all on function public.meal_prep_tasks_validate_meal_reschedule() from public;

drop trigger if exists planned_meals_meal_prep_schedule_guard
on public.planned_meals;

create trigger planned_meals_meal_prep_schedule_guard
before update of planned_date
on public.planned_meals
for each row
execute function public.meal_prep_tasks_validate_meal_reschedule();

alter table public.meal_prep_tasks enable row level security;

drop policy if exists meal_prep_tasks_owner_select on public.meal_prep_tasks;
create policy meal_prep_tasks_owner_select
on public.meal_prep_tasks
for select
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = meal_prep_tasks.planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
);

drop policy if exists meal_prep_tasks_owner_insert on public.meal_prep_tasks;
create policy meal_prep_tasks_owner_insert
on public.meal_prep_tasks
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = meal_prep_tasks.planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
  and (
    planned_meal_item_id is null
    or exists (
      select 1
      from public.planned_meal_items item
      where item.id = meal_prep_tasks.planned_meal_item_id
        and item.planned_meal_id = meal_prep_tasks.planned_meal_id
        and item.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists meal_prep_tasks_owner_update on public.meal_prep_tasks;
create policy meal_prep_tasks_owner_update
on public.meal_prep_tasks
for update
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = meal_prep_tasks.planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
)
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = meal_prep_tasks.planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
  and (
    planned_meal_item_id is null
    or exists (
      select 1
      from public.planned_meal_items item
      where item.id = meal_prep_tasks.planned_meal_item_id
        and item.planned_meal_id = meal_prep_tasks.planned_meal_id
        and item.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists meal_prep_tasks_owner_delete on public.meal_prep_tasks;
create policy meal_prep_tasks_owner_delete
on public.meal_prep_tasks
for delete
using (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.planned_meals meal
    where meal.id = meal_prep_tasks.planned_meal_id
      and meal.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.meal_prep_tasks to authenticated;

comment on table public.meal_prep_tasks is
  'Attivita personali di Meal Prep collegate a un pasto del Planner e, facoltativamente, a un suo elemento.';

comment on column public.meal_prep_tasks.scheduled_date is
  'Data locale della preparazione; non puo essere successiva alla data del pasto collegato.';

comment on column public.meal_prep_tasks.planned_meal_item_id is
  'Elemento specifico del pasto da preparare; NULL indica che il task riguarda l intero pasto.';

commit;

select
  to_regclass('public.meal_prep_tasks') as meal_prep_tasks,
  exists (
    select 1
    from pg_constraint
    where conname = 'meal_prep_tasks_planned_meal_id_fkey'
      and conrelid = 'public.meal_prep_tasks'::regclass
  ) as planned_meal_foreign_key,
  exists (
    select 1
    from pg_constraint
    where conname = 'meal_prep_tasks_planned_meal_item_id_fkey'
      and conrelid = 'public.meal_prep_tasks'::regclass
  ) as planned_meal_item_foreign_key,
  to_regclass('public.meal_prep_tasks_owner_schedule_idx') is not null
    as schedule_index,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.meal_prep_tasks'::regclass
  ) as rls_enabled,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'meal_prep_tasks'
  ) as policy_count,
  exists (
    select 1
    from pg_trigger
    where tgname = 'meal_prep_tasks_link_guard'
      and tgrelid = 'public.meal_prep_tasks'::regclass
      and not tgisinternal
  ) as link_guard_enabled,
  exists (
    select 1
    from pg_trigger
    where tgname = 'planned_meals_meal_prep_schedule_guard'
      and tgrelid = 'public.planned_meals'::regclass
      and not tgisinternal
  ) as meal_reschedule_guard_enabled;
