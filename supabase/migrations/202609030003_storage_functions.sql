insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('team-crests', 'team-crests', true, 5242880, array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('brand-assets', 'brand-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('site-assets', 'site-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('customer-customizations', 'customer-customizations', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads storefront assets" on storage.objects
for select to public using (bucket_id in ('product-images','team-crests','brand-assets','site-assets','customer-customizations'));

create policy "admins upload managed assets" on storage.objects
for insert to authenticated with check (
  bucket_id in ('product-images','team-crests','brand-assets','site-assets') and public.is_admin()
);
create policy "admins update managed assets" on storage.objects
for update to authenticated using (
  bucket_id in ('product-images','team-crests','brand-assets','site-assets') and public.is_admin()
) with check (public.is_admin());
create policy "admins delete managed assets" on storage.objects
for delete to authenticated using (
  bucket_id in ('product-images','team-crests','brand-assets','site-assets') and public.is_admin()
);

create policy "customers upload random customization images" on storage.objects
for insert to anon, authenticated with check (
  bucket_id = 'customer-customizations'
  and (storage.foldername(name))[1] = 'uploads'
  and name ~ '^uploads/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
);

create or replace function public.search_products(search_term text, result_limit integer default 12)
returns table (
  id uuid,
  name text,
  slug text,
  base_price numeric,
  promo_price numeric,
  promo_start timestamptz,
  promo_end timestamptz,
  team_name text,
  brand_name text,
  image_url text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with searchable as (
    select p.*,
      t.name team_name,
      b.name brand_name,
      coalesce(string_agg(distinct c.name, ' '), '') category_names,
      coalesce(string_agg(distinct pc.name, ' '), '') color_names,
      (select pi.url from public.product_images pi where pi.product_id = p.id order by pi.is_primary desc, pi.sort_order limit 1) image_url
    from public.products p
    left join public.teams t on t.id = p.team_id
    left join public.brands b on b.id = p.brand_id
    left join public.product_categories px on px.product_id = p.id
    left join public.categories c on c.id = px.category_id
    left join public.product_colors pc on pc.product_id = p.id
    where p.status = 'published'
    group by p.id, t.name, b.name
  ), ranked as (
    select s.*,
      greatest(
        similarity(unaccent(lower(s.name)), unaccent(lower(search_term))) * 1.5,
        similarity(unaccent(lower(coalesce(s.team_name,''))), unaccent(lower(search_term))) * 1.3,
        similarity(unaccent(lower(coalesce(s.brand_name,''))), unaccent(lower(search_term))),
        similarity(unaccent(lower(s.category_names || ' ' || s.color_names || ' ' || coalesce(s.material,'') || ' ' || coalesce(s.description,''))), unaccent(lower(search_term)))
      )::real as relevance
    from searchable s
    where unaccent(lower(concat_ws(' ', s.name, s.team_name, s.brand_name, s.category_names, s.color_names, s.material, s.description)))
      % unaccent(lower(search_term))
      or unaccent(lower(concat_ws(' ', s.name, s.team_name, s.brand_name, s.category_names, s.color_names, s.material, s.description)))
      like '%' || unaccent(lower(search_term)) || '%'
  )
  select r.id, r.name, r.slug, r.base_price, r.promo_price, r.promo_start, r.promo_end,
    r.team_name, r.brand_name, r.image_url, r.relevance
  from ranked r
  order by r.relevance desc, r.name
  limit least(greatest(result_limit, 1), 50);
$$;

grant execute on function public.search_products(text, integer) to anon, authenticated;

create or replace function public.validate_cart(cart_items jsonb)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  product_status text,
  color_name text,
  size_name text,
  stock integer,
  current_price numeric,
  requested_quantity integer,
  valid boolean,
  reason text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.id,
    p.id,
    p.name,
    p.slug,
    p.status,
    c.name,
    s.name,
    v.stock,
    case
      when p.promo_price is not null
        and (p.promo_start is null or p.promo_start <= now())
        and (p.promo_end is null or p.promo_end >= now())
      then p.promo_price else p.base_price
    end,
    greatest(coalesce((item->>'quantity')::integer, 0), 0),
    p.status = 'published' and v.active and not p.force_sold_out
      and v.stock >= greatest(coalesce((item->>'quantity')::integer, 0), 0)
      and greatest(coalesce((item->>'quantity')::integer, 0), 0) > 0,
    case
      when p.status <> 'published' then 'El producto ya no está publicado.'
      when not v.active or p.force_sold_out then 'Esta combinación está agotada.'
      when greatest(coalesce((item->>'quantity')::integer, 0), 0) < 1 then 'La cantidad no es válida.'
      when v.stock < greatest(coalesce((item->>'quantity')::integer, 0), 0)
        then 'Actualmente solo quedan ' || v.stock || ' unidades.'
      else null
    end
  from jsonb_array_elements(cart_items) item
  join public.product_variants v on v.id = (item->>'variant_id')::uuid
  join public.products p on p.id = v.product_id
  join public.product_colors c on c.id = v.color_id
  join public.product_sizes s on s.id = v.size_id;
$$;

grant execute on function public.validate_cart(jsonb) to anon, authenticated;

