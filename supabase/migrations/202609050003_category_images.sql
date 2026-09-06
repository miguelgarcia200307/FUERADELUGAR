insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'category-images',
  'category-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads category images" on storage.objects
for select to public
using (bucket_id = 'category-images');

create policy "admins upload category images" on storage.objects
for insert to authenticated
with check (bucket_id = 'category-images' and public.is_admin());

create policy "admins update category images" on storage.objects
for update to authenticated
using (bucket_id = 'category-images' and public.is_admin())
with check (bucket_id = 'category-images' and public.is_admin());

create policy "admins delete category images" on storage.objects
for delete to authenticated
using (bucket_id = 'category-images' and public.is_admin());
