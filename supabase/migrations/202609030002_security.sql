create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.categories enable row level security;
alter table public.teams enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_colors enable row level security;
alter table public.product_sizes enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.payment_methods enable row level security;

create policy "admin can read own membership" on public.admins
for select to authenticated using (user_id = auth.uid());

create policy "settings are public" on public.site_settings
for select to anon, authenticated using (true);
create policy "admins manage settings" on public.site_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "active categories are public" on public.categories
for select to anon, authenticated using (active or public.is_admin());
create policy "admins manage categories" on public.categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "active teams are public" on public.teams
for select to anon, authenticated using (active or public.is_admin());
create policy "admins manage teams" on public.teams
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "active brands are public" on public.brands
for select to anon, authenticated using (active or public.is_admin());
create policy "admins manage brands" on public.brands
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "published products are public" on public.products
for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy "admins manage products" on public.products
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "published product categories are public" on public.product_categories
for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin()))
);
create policy "admins manage product categories" on public.product_categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "published product colors are public" on public.product_colors
for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin()))
);
create policy "admins manage product colors" on public.product_colors
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "published product sizes are public" on public.product_sizes
for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin()))
);
create policy "admins manage product sizes" on public.product_sizes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "published variants are public" on public.product_variants
for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin()))
);
create policy "admins manage variants" on public.product_variants
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "published product images are public" on public.product_images
for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin()))
);
create policy "admins manage product images" on public.product_images
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "active payments are public" on public.payment_methods
for select to anon, authenticated using (active or public.is_admin());
create policy "admins manage payments" on public.payment_methods
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.admins to authenticated;
grant select on public.site_settings, public.categories, public.teams, public.brands,
  public.products, public.product_categories, public.product_colors, public.product_sizes,
  public.product_variants, public.product_images, public.payment_methods to anon, authenticated;
grant insert, update, delete on public.site_settings, public.categories, public.teams, public.brands,
  public.products, public.product_categories, public.product_colors, public.product_sizes,
  public.product_variants, public.product_images, public.payment_methods to authenticated;
