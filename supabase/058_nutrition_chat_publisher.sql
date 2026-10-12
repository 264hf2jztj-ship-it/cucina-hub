begin;

create extension if not exists pg_jsonschema with schema extensions;
create schema if not exists nutrition_private;
revoke all on schema nutrition_private from public, anon, authenticated, service_role;
grant usage on schema nutrition_private to postgres;

create table if not exists nutrition_private.chat_publisher_config (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table nutrition_private.chat_publisher_config enable row level security;
revoke all on nutrition_private.chat_publisher_config from public, anon, authenticated, service_role;

-- Associazione iniziale esplicitamente autorizzata: mai scegliere un utente
-- arbitrario, né riassegnare una configurazione già presente.
do $$
declare
  v_admin_count integer;
  v_owner uuid;
begin
  if not exists (select 1 from nutrition_private.chat_publisher_config) then
    select count(*) into v_admin_count from public.profiles where role = 'admin';
    if v_admin_count <> 1 then
      raise exception 'nutrition_chat_requires_single_admin';
    end if;
    select id into v_owner from public.profiles where role = 'admin';
    insert into nutrition_private.chat_publisher_config (owner_user_id) values (v_owner);
  end if;
end;
$$;

create or replace function nutrition_private.plan_schema()
returns json
language sql
immutable
security invoker
set search_path = pg_catalog
as $schema_function$
select $schema$
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["contract", "version", "plan", "check_in", "goal", "days", "shopping_list", "publication"],
  "properties": {
    "contract": {"const": "cucina-hub.nutrition-plan"},
    "version": {"const": 1},
    "plan": {
      "type": "object", "additionalProperties": false,
      "required": ["external_id", "revision", "title", "week_start", "week_end", "timezone", "source"],
      "properties": {
        "external_id": {"type": "string", "pattern": "\\S", "maxLength": 160},
        "revision": {"type": "integer", "minimum": 1, "maximum": 2147483647},
        "title": {"type": "string", "pattern": "\\S", "maxLength": 240},
        "week_start": {"$ref": "#/definitions/date"},
        "week_end": {"$ref": "#/definitions/date"},
        "timezone": {"const": "Europe/Rome"},
        "source": {
          "type": "object", "additionalProperties": false,
          "required": ["type", "label", "generated_at"],
          "properties": {
            "type": {"const": "chatgpt_project"},
            "label": {"type": "string", "pattern": "\\S", "maxLength": 200},
            "generated_at": {"type": "string", "format": "date-time", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"}
          }
        }
      }
    },
    "check_in": {
      "type": "object", "additionalProperties": false,
      "required": ["measured_at", "weight_kg", "waist_cm"],
      "properties": {
        "measured_at": {"$ref": "#/definitions/date"},
        "weight_kg": {"type": "number", "minimum": 20, "maximum": 400},
        "waist_cm": {"type": "number", "minimum": 30, "maximum": 300},
        "body_fat_percent": {"type": ["number", "null"], "minimum": 1, "maximum": 75},
        "note": {"type": ["string", "null"], "maxLength": 1000}
      }
    },
    "goal": {
      "type": "object", "additionalProperties": false,
      "required": ["summary", "strategy", "protein_target_g"],
      "properties": {
        "summary": {"type": "string", "pattern": "\\S", "maxLength": 500},
        "strategy": {"type": "string", "pattern": "\\S", "maxLength": 2000},
        "protein_target_g": {
          "type": "object", "additionalProperties": false, "required": ["min", "max"],
          "properties": {
            "min": {"type": "integer", "minimum": 1, "maximum": 500},
            "max": {"type": "integer", "minimum": 1, "maximum": 500}
          }
        }
      }
    },
    "days": {
      "type": "array", "minItems": 7, "maxItems": 7,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["date", "day_type", "meals"],
        "properties": {
          "date": {"$ref": "#/definitions/date"},
          "day_type": {"enum": ["miletto", "freeletics", "rest", "other"]},
          "training": {
            "type": ["object", "null"], "additionalProperties": false, "required": ["name"],
            "properties": {
              "name": {"type": "string", "pattern": "\\S", "maxLength": 240},
              "start_time": {"anyOf": [{"$ref": "#/definitions/time"}, {"type": "null"}]},
              "note": {"type": ["string", "null"], "maxLength": 1000}
            }
          },
          "meals": {
            "type": "array", "minItems": 1,
            "items": {
              "type": "object", "additionalProperties": false,
              "required": ["key", "slot", "title", "components"],
              "properties": {
                "key": {"type": "string", "pattern": "\\S", "maxLength": 200},
                "slot": {"enum": ["breakfast", "morning_snack", "lunch", "pre_workout", "post_workout", "afternoon_snack", "dinner", "other"]},
                "title": {"type": "string", "pattern": "\\S", "maxLength": 240},
                "time": {"anyOf": [{"$ref": "#/definitions/time"}, {"type": "null"}]},
                "components": {"type": "array", "items": {"$ref": "#/definitions/component"}},
                "recipe_ref": {"$ref": "#/definitions/recipe"},
                "alternatives": {
                  "type": "array",
                  "items": {
                    "type": "object", "additionalProperties": false, "required": ["label", "components"],
                    "properties": {
                      "label": {"type": "string", "pattern": "\\S", "maxLength": 240},
                      "components": {"type": "array", "items": {"$ref": "#/definitions/component"}},
                      "recipe_ref": {"$ref": "#/definitions/recipe"},
                      "note": {"type": ["string", "null"], "maxLength": 1000}
                    },
                    "anyOf": [
                      {"properties": {"components": {"minItems": 1}}},
                      {"required": ["recipe_ref"], "properties": {"recipe_ref": {"type": "object"}}}
                    ]
                  }
                },
                "note": {"type": ["string", "null"], "maxLength": 1000}
              },
              "anyOf": [
                {"properties": {"components": {"minItems": 1}}},
                {"required": ["recipe_ref"], "properties": {"recipe_ref": {"type": "object"}}}
              ]
            }
          },
          "alcohol": {
            "type": ["object", "null"], "additionalProperties": false, "required": ["label"],
            "properties": {
              "label": {"type": "string", "pattern": "\\S", "maxLength": 240},
              "quantity": {"type": ["number", "null"], "exclusiveMinimum": 0},
              "unit": {"type": ["string", "null"], "pattern": "\\S", "maxLength": 40},
              "note": {"type": ["string", "null"], "maxLength": 500}
            },
            "if": {"required": ["quantity"], "properties": {"quantity": {"type": "number"}}},
            "then": {"required": ["unit"], "properties": {"unit": {"type": "string"}}}
          },
          "note": {"type": ["string", "null"], "maxLength": 2000}
        }
      }
    },
    "shopping_list": {
      "type": "object", "additionalProperties": false, "required": ["categories"],
      "properties": {
        "categories": {
          "type": "array",
          "items": {
            "type": "object", "additionalProperties": false, "required": ["key", "label", "items"],
            "properties": {
              "key": {"enum": ["proteins", "carbohydrates", "fruit", "vegetables", "dairy", "fats_extras", "other"]},
              "label": {"type": "string", "pattern": "\\S", "maxLength": 120},
              "items": {"type": "array", "items": {"$ref": "#/definitions/component"}}
            }
          }
        }
      }
    },
    "publication": {
      "type": "object", "additionalProperties": false,
      "required": ["mode", "on_conflict", "preserve_current_on_error"],
      "properties": {
        "mode": {"const": "auto_if_conflict_free"},
        "on_conflict": {"const": "require_confirmation"},
        "preserve_current_on_error": {"const": true}
      }
    }
  },
  "definitions": {
    "date": {"type": "string", "format": "date", "pattern": "^\\d{4}-\\d{2}-\\d{2}$"},
    "time": {"type": "string", "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"},
    "recipe": {
      "type": ["object", "null"], "additionalProperties": false, "required": ["code"],
      "properties": {"code": {"type": "string", "pattern": "\\S", "maxLength": 120}}
    },
    "component": {
      "type": "object", "additionalProperties": false, "required": ["name"],
      "properties": {
        "name": {"type": "string", "pattern": "\\S", "maxLength": 240},
        "quantity": {"type": ["number", "null"], "exclusiveMinimum": 0},
        "unit": {"type": ["string", "null"], "pattern": "\\S", "maxLength": 40},
        "note": {"type": ["string", "null"], "maxLength": 500}
      },
      "if": {"required": ["quantity"], "properties": {"quantity": {"type": "number"}}},
      "then": {"required": ["unit"], "properties": {"unit": {"type": "string"}}}
    }
  }
}
$schema$::json;
$schema_function$;

create or replace function nutrition_private.validate_plan(p_packet jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, extensions
as $$
declare
  v_start date;
  v_end date;
  v_day jsonb;
  v_day_date date;
  v_seen_dates date[] := array[]::date[];
  v_count integer;
  v_distinct integer;
begin
  if p_packet is null or octet_length(p_packet::text) > 2097152 then
    raise exception using errcode = '22023', message = 'nutrition_chat_packet_size_invalid';
  end if;
  if not extensions.jsonb_matches_schema(nutrition_private.plan_schema(), p_packet) then
    raise exception using errcode = '22023', message = 'nutrition_chat_contract_invalid';
  end if;
  begin
    v_start := (p_packet #>> '{plan,week_start}')::date;
    v_end := (p_packet #>> '{plan,week_end}')::date;
    perform (p_packet #>> '{check_in,measured_at}')::date;
    perform (p_packet #>> '{plan,source,generated_at}')::timestamptz;
    if extract(isodow from v_start) <> 1 or v_end <> v_start + 6 then
      raise exception 'invalid week';
    end if;
    for v_day in select value from jsonb_array_elements(p_packet -> 'days') loop
      v_day_date := (v_day ->> 'date')::date;
      if v_day_date < v_start or v_day_date > v_end or v_day_date = any(v_seen_dates) then
        raise exception 'invalid day';
      end if;
      v_seen_dates := array_append(v_seen_dates, v_day_date);
      if (v_day ->> 'day_type' = 'rest' and coalesce(v_day -> 'training', 'null'::jsonb) <> 'null'::jsonb)
         or (v_day ->> 'day_type' in ('miletto', 'freeletics') and jsonb_typeof(v_day -> 'training') is distinct from 'object') then
        raise exception 'invalid training';
      end if;
    end loop;
  exception when others then
    raise exception using errcode = '22023', message = 'nutrition_chat_dates_or_training_invalid';
  end;
  if (p_packet #>> '{goal,protein_target_g,min}')::integer > (p_packet #>> '{goal,protein_target_g,max}')::integer then
    raise exception using errcode = '22023', message = 'nutrition_chat_protein_range_invalid';
  end if;
  select count(*), count(distinct btrim(meal ->> 'key')) into v_count, v_distinct
  from jsonb_array_elements(p_packet -> 'days') day_entry(day)
  cross join lateral jsonb_array_elements(day -> 'meals') meal_entry(meal);
  if v_count <> v_distinct then
    raise exception using errcode = '22023', message = 'nutrition_chat_duplicate_meal_key';
  end if;
  select count(*), count(distinct category ->> 'key') into v_count, v_distinct
  from jsonb_array_elements(p_packet #> '{shopping_list,categories}') category_entry(category);
  if v_count <> v_distinct then
    raise exception using errcode = '22023', message = 'nutrition_chat_duplicate_shopping_category';
  end if;
end;
$$;

create or replace function nutrition_private.publisher_owner()
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare v_owner uuid;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'nutrition_chat_admin_connection_required';
  end if;
  select config.owner_user_id into v_owner
  from nutrition_private.chat_publisher_config config
  join public.profiles profile on profile.id = config.owner_user_id and profile.role = 'admin'
  where config.singleton and config.enabled;
  if v_owner is null then
    raise exception using errcode = '42501', message = 'nutrition_chat_publisher_disabled';
  end if;
  return v_owner;
end;
$$;

create or replace function nutrition_private.normalize_units(p_value jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_key text;
  v_value jsonb;
  v_unit text;
begin
  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(nutrition_private.normalize_units(value) order by position), '[]'::jsonb)
    into v_result from jsonb_array_elements(p_value) with ordinality entry(value, position);
    return v_result;
  elsif jsonb_typeof(p_value) = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_value in select key, value from jsonb_each(p_value) loop
      if v_key = 'unit' and jsonb_typeof(v_value) = 'string' then
        v_unit := btrim(v_value #>> '{}');
        if lower(v_unit) in ('g', 'kg', 'ml', 'l', 'piece', 'slice', 'portion') then
          v_unit := lower(v_unit);
        end if;
        v_value := to_jsonb(v_unit);
      else
        v_value := nutrition_private.normalize_units(v_value);
      end if;
      v_result := v_result || jsonb_build_object(v_key, v_value);
    end loop;
    return v_result;
  end if;
  return p_value;
end;
$$;

create or replace function nutrition_private.publish_plan(p_packet jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, extensions
as $$
declare
  v_owner uuid;
  v_packet jsonb := p_packet;
  v_canonical text;
  v_hash text;
  v_result jsonb;
  v_existing record;
  v_old_role text := current_setting('role');
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_old_claims text := current_setting('request.jwt.claims', true);
begin
  perform 1 from nutrition_private.chat_publisher_config where singleton for share;
  v_owner := nutrition_private.publisher_owner();
  perform nutrition_private.validate_plan(v_packet);
  v_packet := nutrition_private.normalize_units(v_packet);
  -- Il contratto ammette giorni in ordine diverso. La RPC operativa li richiede
  -- in sequenza: normalizza l'ordine senza inventare o perdere contenuti.
  v_packet := jsonb_set(v_packet, '{days}', (
    select jsonb_agg(day order by day ->> 'date') from jsonb_array_elements(v_packet -> 'days') day_entry(day)
  ));
  v_canonical := v_packet::text;
  v_hash := encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('planner-menu:' || v_owner::text, 0));
  -- Riconosce anche retry identici di piani importati con il canonicalizzatore JS.
  select package.id, package.import_status, nutrition.source_payload, nutrition.source_payload_hash into v_existing
  from public.planner_menu_packages package
  join public.nutrition_plan_weeks nutrition on nutrition.planner_menu_package_id = package.id
    and nutrition.owner_user_id = package.owner_user_id
  where package.owner_user_id = v_owner
    and package.source_type = v_packet #>> '{plan,source,type}'
    and package.source_external_id = btrim(v_packet #>> '{plan,external_id}')
    and package.source_revision = (v_packet #>> '{plan,revision}')::integer;
  if found and v_existing.source_payload = v_packet then
    return jsonb_build_object('status', 'already_imported', 'created', false,
      'package_id', v_existing.id, 'nutrition_payload_hash', v_existing.source_payload_hash,
      'nutrition_plan_saved', true, 'active', v_existing.import_status = 'confirmed');
  end if;

  -- Delega amministrativa esplicita e confinata alla chiamata, NON un JWT
  -- proveniente dal client. L'identità è fissata dalla configurazione privata.
  -- Il ruolo ridotto applica le RLS durante tutte le scritture del commit.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_result := public.commit_nutrition_plan(v_packet, v_canonical, v_hash, '[]'::jsonb, false);
  perform set_config('role', v_old_role, true);
  perform set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
  return v_result || jsonb_build_object('active', true);
exception when others then
  -- Il subtransaction rollback annulla il commit; ripristina anche il contesto
  -- esplicitamente per impedire contaminazioni della connessione successiva.
  perform set_config('role', v_old_role, true);
  perform set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
  raise;
end;
$$;

create or replace function nutrition_private.chat_context(p_week_start date)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare v_owner uuid;
begin
  v_owner := nutrition_private.publisher_owner();
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'nutrition_chat_week_start_invalid';
  end if;
  return jsonb_build_object(
    'contract', nutrition_private.plan_schema()::jsonb,
    'week_start', p_week_start,
    'week_end', p_week_start + 6,
    'history', coalesce((
      select jsonb_agg(entry.payload order by entry.period_start desc, entry.revision desc)
      from (
        select nutrition.source_payload as payload, package.period_start, package.source_revision as revision
        from public.nutrition_plan_weeks nutrition
        join public.planner_menu_packages package on package.id = nutrition.planner_menu_package_id
          and package.owner_user_id = nutrition.owner_user_id
        where nutrition.owner_user_id = v_owner and package.period_start <= p_week_start
        order by package.period_start desc, package.source_revision desc limit 8
      ) entry
    ), '[]'::jsonb),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'title', title) order by code)
      from public.recipes where owner_user_id = v_owner and nullif(btrim(code), '') is not null
    ), '[]'::jsonb),
    'publication_function', 'nutrition_private.publish_plan',
    'conflicts', 'stop_without_overwrite',
    'github_weekly_commit_required', false
  );
end;
$$;

revoke all on all functions in schema nutrition_private from public, anon, authenticated, service_role;
grant execute on all functions in schema nutrition_private to postgres;

comment on schema nutrition_private is
  'Ponte privato del plugin amministrativo Supabase: proprietario fissato, validazione e pubblicazione senza risoluzione automatica dei conflitti. Non esporre tramite Data API.';

commit;
