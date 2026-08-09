begin;

alter table public.baking_session_photos
  add column if not exists photo_kind text,
  add column if not exists caption text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'baking_session_photos_kind_allowed'
  ) then
    alter table public.baking_session_photos
      add constraint baking_session_photos_kind_allowed
      check (
        photo_kind is null
        or photo_kind in (
          'dough',
          'bulk',
          'cold',
          'proof',
          'pre_bake',
          'whole',
          'crust',
          'crumb',
          'base',
          'slice',
          'other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'baking_session_photos_sort_order_valid'
  ) then
    alter table public.baking_session_photos
      add constraint baking_session_photos_sort_order_valid
      check (sort_order >= 0);
  end if;
end
$$;

with ranked as (
  select
    id,
    row_number() over (
      partition by session_id
      order by created_at, id
    ) * 10 as desired_order
  from public.baking_session_photos
)
update public.baking_session_photos photo
set sort_order = ranked.desired_order
from ranked
where photo.id = ranked.id
  and photo.sort_order = 0;

create index if not exists baking_session_photos_session_order_idx
on public.baking_session_photos(session_id, sort_order, created_at);

grant select, insert, update, delete
on public.baking_session_photos
to authenticated;

commit;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'baking_session_photos'
  and column_name in ('photo_kind', 'caption', 'sort_order', 'updated_at')
order by ordinal_position;
