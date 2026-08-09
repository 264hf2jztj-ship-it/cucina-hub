begin;

alter table public.baking_sessions
  add column if not exists dough_shape text,
  add column if not exists portion_count integer,
  add column if not exists portion_weight_g numeric(10,1),
  add column if not exists dough_total_weight_g numeric(10,1),
  add column if not exists tray_width_cm numeric(6,1),
  add column if not exists tray_length_cm numeric(6,1),
  add column if not exists round_diameter_cm numeric(6,1),
  add column if not exists dough_loading_g_cm2 numeric(6,3),
  add column if not exists sizing_profile text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_dough_shape_allowed') then
    alter table public.baking_sessions
      add constraint baking_sessions_dough_shape_allowed
      check (dough_shape is null or dough_shape in ('tray','round','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_portion_count_valid') then
    alter table public.baking_sessions
      add constraint baking_sessions_portion_count_valid
      check (portion_count is null or portion_count between 1 and 50);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_portion_weight_valid') then
    alter table public.baking_sessions
      add constraint baking_sessions_portion_weight_valid
      check (portion_weight_g is null or portion_weight_g > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_dough_total_weight_valid') then
    alter table public.baking_sessions
      add constraint baking_sessions_dough_total_weight_valid
      check (dough_total_weight_g is null or dough_total_weight_g > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_tray_dimensions_valid') then
    alter table public.baking_sessions
      add constraint baking_sessions_tray_dimensions_valid
      check (
        dough_shape is distinct from 'tray'
        or (tray_width_cm > 0 and tray_length_cm > 0 and round_diameter_cm is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_round_diameter_valid') then
    alter table public.baking_sessions
      add constraint baking_sessions_round_diameter_valid
      check (
        dough_shape is distinct from 'round'
        or (round_diameter_cm > 0 and tray_width_cm is null and tray_length_cm is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_loading_valid') then
    alter table public.baking_sessions
      add constraint baking_sessions_loading_valid
      check (dough_loading_g_cm2 is null or dough_loading_g_cm2 between 0.15 and 1.20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baking_sessions_sizing_profile_allowed') then
    alter table public.baking_sessions
      add constraint baking_sessions_sizing_profile_allowed
      check (sizing_profile is null or sizing_profile in ('thin','standard','thick','custom','manual'));
  end if;
end $$;

comment on column public.baking_sessions.dough_shape is 'Forma usata per dimensionare l impasto: tray, round o manual.';
comment on column public.baking_sessions.portion_count is 'Numero di teglie/panetti previsti nella sessione.';
comment on column public.baking_sessions.portion_weight_g is 'Peso calcolato di ogni panetto o porzione di impasto.';
comment on column public.baking_sessions.dough_total_weight_g is 'Peso totale calcolato dell impasto completo.';
comment on column public.baking_sessions.dough_loading_g_cm2 is 'Carico di impasto per centimetro quadrato usato dal calcolo.';

commit;

select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'baking_sessions'
  and column_name in (
    'dough_shape','portion_count','portion_weight_g','dough_total_weight_g',
    'tray_width_cm','tray_length_cm','round_diameter_cm','dough_loading_g_cm2','sizing_profile'
  )
order by ordinal_position;
