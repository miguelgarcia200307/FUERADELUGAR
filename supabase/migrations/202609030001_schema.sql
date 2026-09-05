create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Fuera de Lugar Sport',
  tagline text not null default 'Tu pasión juega aquí',
  whatsapp text not null default '573023031112',
  phone text,
  email text,
  address text not null default 'Calle 17 No. 8 - 46, Centro',
  city text not null default 'Valledupar - Cesar',
  schedule text default 'Lunes a sábado · 8:00 a. m. – 7:00 p. m.',
  instagram text default '@fueradelugar_sport',
  facebook text,
  tiktok text,
  maps_url text,
  logo_url text,
  default_sort text not null default 'featured',
  checkout_behavior text not null default 'keep' check (checkout_behavior in ('keep','clear')),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null check (type in ('club','national_team','colombian_team')),
  crest_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  material text,
  base_price numeric(12,2) not null check (base_price >= 0),
  promo_price numeric(12,2) check (promo_price is null or promo_price >= 0),
  promo_start timestamptz,
  promo_end timestamptz,
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  team_id uuid references public.teams(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  featured boolean not null default false,
  is_personalizable boolean not null default false,
  personalization_price numeric(12,2) not null default 0 check (personalization_price >= 0),
  allow_name boolean not null default true,
  allow_number boolean not null default true,
  allow_logo boolean not null default false,
  allow_font boolean not null default true,
  allow_text_color boolean not null default true,
  force_last_units boolean not null default false,
  force_sold_out boolean not null default false,
  size_guide_text text,
  size_guide_image_url text,
  front_template_url text,
  back_template_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (promo_price is null or promo_price < base_price),
  check (promo_end is null or promo_start is null or promo_end > promo_start)
);

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table public.product_colors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  hex_code text check (hex_code is null or hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  unique (product_id, name)
);

create table public.product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (product_id, name)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid not null references public.product_colors(id) on delete cascade,
  size_id uuid not null references public.product_sizes(id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (product_id, color_id, size_id)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid references public.product_colors(id) on delete cascade,
  url text not null,
  alt_text text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  instructions text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger teams_updated_at before update on public.teams
for each row execute function public.set_updated_at();
create trigger brands_updated_at before update on public.brands
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger variants_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.site_settings
for each row execute function public.set_updated_at();

create or replace function public.ensure_unique_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base_slug text := trim(both '-' from lower(new.slug));
  candidate text;
  suffix integer := 1;
  found boolean;
begin
  if base_slug is null or base_slug = '' then
    raise exception 'El slug no puede estar vacío';
  end if;
  candidate := base_slug;
  loop
    execute format('select exists(select 1 from public.%I where slug = $1 and id <> $2)', tg_table_name)
      into found using candidate, new.id;
    exit when not found;
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger products_unique_slug before insert or update of slug on public.products
for each row execute function public.ensure_unique_slug();
create trigger categories_unique_slug before insert or update of slug on public.categories
for each row execute function public.ensure_unique_slug();
create trigger teams_unique_slug before insert or update of slug on public.teams
for each row execute function public.ensure_unique_slug();
create trigger brands_unique_slug before insert or update of slug on public.brands
for each row execute function public.ensure_unique_slug();

create index categories_parent_idx on public.categories(parent_id);
create index categories_active_name_idx on public.categories(active, name);
create index teams_active_name_idx on public.teams(active, name);
create index brands_active_name_idx on public.brands(active, name);
create index products_status_created_idx on public.products(status, created_at desc);
create index products_team_idx on public.products(team_id);
create index products_brand_idx on public.products(brand_id);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index product_categories_category_idx on public.product_categories(category_id);
create index colors_product_idx on public.product_colors(product_id);
create index sizes_product_idx on public.product_sizes(product_id);
create index variants_product_idx on public.product_variants(product_id);
create index variants_color_size_idx on public.product_variants(color_id, size_id);
create index images_product_sort_idx on public.product_images(product_id, sort_order);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;
