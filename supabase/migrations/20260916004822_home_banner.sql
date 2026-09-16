alter table public.site_settings
  add column banner_enabled boolean not null default false,
  add column banner_interval_seconds numeric(4,1) not null default 5
    check (banner_interval_seconds between 0.5 and 60);

create table public.homepage_banners (
  id uuid primary key default gen_random_uuid(),
  desktop_image_url text not null,
  mobile_image_url text,
  alt_text text not null check (length(btrim(alt_text)) between 1 and 200),
  link_url text,
  active boolean not null default true,
  sort_order integer not null check (sort_order between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_desktop_storage_check check (desktop_image_url ~ '^https://[^[:space:]]+/storage/v1/object/public/banner-images/home/[0-9a-f-]+\.(webp|jpg|jpeg|png|avif)$'),
  constraint banner_mobile_storage_check check (mobile_image_url is null or mobile_image_url ~ '^https://[^[:space:]]+/storage/v1/object/public/banner-images/home/[0-9a-f-]+\.(webp|jpg|jpeg|png|avif)$'),
  constraint banner_link_check check (link_url is null or (
    length(link_url) <= 2048 and
    (link_url ~ '^https?://' or link_url ~ '^[/#A-Za-z0-9][A-Za-z0-9_./?=&%#-]*$')
  ))
);
create index homepage_banners_active_order_idx on public.homepage_banners(active, sort_order, id);
create trigger homepage_banners_updated_at before update on public.homepage_banners
  for each row execute function public.set_updated_at();

create or replace function public.check_homepage_banner_count()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  perform pg_advisory_xact_lock(714582);
  if (select count(*) from public.homepage_banners) >= 5 then
    raise exception 'Se permiten como máximo cinco banners';
  end if;
  return new;
end;
$$;
create trigger homepage_banner_limit before insert on public.homepage_banners
  for each row execute function public.check_homepage_banner_count();
create or replace function public.enforce_homepage_banner_count()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if (select count(*) from public.homepage_banners) > 5 then
    raise exception 'Se permiten como máximo cinco banners';
  end if;
  return null;
end;
$$;
create trigger homepage_banner_limit_after after insert on public.homepage_banners
  for each row execute function public.enforce_homepage_banner_count();

alter table public.homepage_banners enable row level security;
create policy "public reads active homepage banners" on public.homepage_banners
  for select to anon, authenticated using (active or public.is_admin());
create policy "admins manage homepage banners" on public.homepage_banners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.homepage_banners to anon, authenticated;
grant insert, update, delete on public.homepage_banners to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banner-images', 'banner-images', true, 1048576,
  array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy "public reads banner images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'banner-images');
create policy "admins upload banner images" on storage.objects for insert to authenticated
  with check (bucket_id = 'banner-images' and name ~ '^home/[0-9a-f-]+\.(webp|jpg|jpeg|png|avif)$' and public.is_admin());
create policy "admins delete banner images" on storage.objects for delete to authenticated
  using (bucket_id = 'banner-images' and public.is_admin());

create or replace function public.save_homepage_banners(
  new_enabled boolean, new_interval numeric, new_banners jsonb
) returns setof public.homepage_banners
language plpgsql security definer set search_path = public, pg_catalog as $$
declare item jsonb; banner_id uuid; ids uuid[] := '{}'; position integer := 0;
begin
  if not public.is_admin() then raise exception 'Sin permiso de administrador'; end if;
  if new_interval is null or new_interval < 0.5 or new_interval > 60
    or new_interval <> round(new_interval, 1) then
    raise exception 'El intervalo debe estar entre 0.5 y 60 segundos';
  end if;
  if jsonb_typeof(new_banners) <> 'array' or jsonb_array_length(new_banners) > 5 then
    raise exception 'Se permiten como máximo cinco banners';
  end if;
  perform 1 from public.site_settings where id = 1 for update;
  perform pg_advisory_xact_lock(714582);
  delete from public.homepage_banners old
    where not exists (
      select 1 from jsonb_array_elements(new_banners) candidate
      where candidate->>'id' = old.id::text
    );
  for item in select value from jsonb_array_elements(new_banners) loop
    position := position + 1;
    banner_id := coalesce(nullif(item->>'id','')::uuid, gen_random_uuid());
    if banner_id = any(ids) then raise exception 'ID de banner duplicado'; end if;
    ids := array_append(ids, banner_id);
    if nullif(btrim(item->>'desktop_image_url'),'') is null
      or nullif(btrim(item->>'alt_text'),'') is null then
      raise exception 'Cada banner requiere imagen de escritorio y texto alternativo';
    end if;
    if exists (select 1 from public.homepage_banners where id = banner_id) then
      update public.homepage_banners set
        desktop_image_url=item->>'desktop_image_url',
        mobile_image_url=nullif(item->>'mobile_image_url',''),
        alt_text=item->>'alt_text', link_url=nullif(item->>'link_url',''),
        active=coalesce((item->>'active')::boolean,true), sort_order=position
      where id = banner_id;
    else
      insert into public.homepage_banners
        (id,desktop_image_url,mobile_image_url,alt_text,link_url,active,sort_order)
      values (banner_id,item->>'desktop_image_url',nullif(item->>'mobile_image_url',''),
        item->>'alt_text',nullif(item->>'link_url',''),
        coalesce((item->>'active')::boolean,true),position);
    end if;
  end loop;
  delete from public.homepage_banners where not (id = any(ids));
  update public.site_settings set banner_enabled = coalesce(new_enabled,false),
    banner_interval_seconds = new_interval where id = 1;
  return query select * from public.homepage_banners order by sort_order, id;
end;
$$;
revoke all on function public.save_homepage_banners(boolean,numeric,jsonb) from public;
grant execute on function public.save_homepage_banners(boolean,numeric,jsonb) to authenticated;
