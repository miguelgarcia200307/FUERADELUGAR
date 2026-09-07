alter table public.products
  add column if not exists promo_enabled boolean not null default true;

comment on column public.products.promo_enabled is
  'Permite pausar una promoción sin borrar su precio ni su vigencia.';

create index if not exists products_active_promotion_idx
  on public.products (promo_enabled, promo_start, promo_end)
  where promo_price is not null;

drop function if exists public.search_products(text, integer);

create function public.search_products(search_term text, result_limit integer default 12)
returns table (
  id uuid,
  name text,
  slug text,
  base_price numeric,
  promo_price numeric,
  promo_start timestamptz,
  promo_end timestamptz,
  promo_enabled boolean,
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
      unaccent(lower(concat_ws(' ',
        p.name, t.name, b.name,
        string_agg(distinct c.name, ' '),
        string_agg(distinct pc.name, ' '),
        p.material, p.description
      ))) search_text,
      (select pi.url from public.product_images pi where pi.product_id = p.id order by pi.is_primary desc, pi.sort_order limit 1) image_url
    from public.products p
    left join public.teams t on t.id = p.team_id
    left join public.brands b on b.id = p.brand_id
    left join public.product_categories px on px.product_id = p.id
    left join public.categories c on c.id = px.category_id
    left join public.product_colors pc on pc.product_id = p.id
    where p.status = 'published'
    group by p.id, t.name, b.name
  ), input as (
    select unaccent(lower(trim(search_term))) query
  ), ranked as (
    select s.*,
      greatest(
        similarity(unaccent(lower(s.name)), i.query) * 1.6,
        similarity(unaccent(lower(coalesce(s.team_name,''))), i.query) * 1.35,
        similarity(unaccent(lower(coalesce(s.brand_name,''))), i.query),
        word_similarity(i.query, s.search_text) * 0.9,
        case when s.search_text like '%' || i.query || '%' then 1.1 else 0 end
      )::real relevance
    from searchable s
    cross join input i
    where i.query <> '' and (
      s.search_text like '%' || i.query || '%'
      or word_similarity(i.query, s.search_text) > 0.28
      or not exists (
        select 1
        from regexp_split_to_table(i.query, '\s+') token
        where token <> '' and s.search_text not like '%' || token || '%'
      )
    )
  )
  select r.id, r.name, r.slug, r.base_price, r.promo_price, r.promo_start, r.promo_end,
    r.promo_enabled, r.team_name, r.brand_name, r.image_url, r.relevance
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
        and p.promo_enabled
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
