-- Configurable announcement bar. Extends the existing singleton settings row
-- without replacing data or changing access to unrelated tables.
create or replace function public.is_valid_announcement_messages(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  item jsonb;
  item_position numeric;
begin
  if jsonb_typeof(value) <> 'array' then
    return false;
  end if;

  for item in select * from jsonb_array_elements(value)
  loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'id') <> 'string'
      or length(btrim(item ->> 'id')) = 0
      or jsonb_typeof(item -> 'text') <> 'string'
      or length(btrim(item ->> 'text')) not between 1 and 160
      or jsonb_typeof(item -> 'enabled') <> 'boolean'
      or jsonb_typeof(item -> 'position') <> 'number'
    then
      return false;
    end if;

    begin
      item_position := (item ->> 'position')::numeric;
    exception when others then
      return false;
    end;

    if item_position < 1 or item_position <> trunc(item_position) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.is_valid_announcement_messages(jsonb) from public;

alter table public.site_settings
  add column if not exists announcement_enabled boolean not null default true,
  add column if not exists announcement_mode text not null default 'static',
  add column if not exists announcement_static_text text not null
    default 'Compra por WhatsApp • Atención personalizada • Valledupar',
  add column if not exists announcement_interval_seconds smallint not null default 5,
  add column if not exists announcement_messages jsonb not null default
    '[{"id":"whatsapp","text":"Compra por WhatsApp","enabled":true,"position":1},{"id":"personalized-service","text":"Atención personalizada","enabled":true,"position":2},{"id":"valledupar","text":"Valledupar","enabled":true,"position":3}]'::jsonb;

alter table public.site_settings
  add constraint site_settings_announcement_mode_check
    check (announcement_mode in ('static', 'carousel')),
  add constraint site_settings_announcement_static_text_check
    check (
      length(btrim(announcement_static_text)) <= 160
      and (
        not announcement_enabled
        or announcement_mode <> 'static'
        or length(btrim(announcement_static_text)) >= 1
      )
    ),
  add constraint site_settings_announcement_interval_check
    check (announcement_interval_seconds between 2 and 120),
  add constraint site_settings_announcement_messages_check
    check (public.is_valid_announcement_messages(announcement_messages)),
  add constraint site_settings_announcement_active_message_check
    check (
      not announcement_enabled
      or announcement_mode <> 'carousel'
      or jsonb_path_exists(announcement_messages, '$[*] ? (@.enabled == true)')
    );

comment on column public.site_settings.announcement_messages is
  'Ordered announcement items: [{id, text, enabled, position}].';
