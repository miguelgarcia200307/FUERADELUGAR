-- Product photographs are optimized in the browser to a 2.5 MiB target and an
-- 8 MiB hard output ceiling. This 20 MiB bucket limit is a bounded fallback for
-- codec variation and legacy clients; it is intentionally not unlimited.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  20971520,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Existing Storage RLS policies remain unchanged: public read access and
-- insert/update/delete restricted to authenticated users in public.admins.
