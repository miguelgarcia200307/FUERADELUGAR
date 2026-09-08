-- Keep product photographs when an administrator removes a color unexpectedly.
-- The editor still asks whether to move or delete associated photographs first;
-- SET NULL is the database-level safety net for concurrent or legacy operations.
alter table public.product_images
  drop constraint if exists product_images_color_id_fkey;

alter table public.product_images
  add constraint product_images_color_id_fkey
  foreign key (color_id) references public.product_colors(id) on delete set null;

-- Repair legacy products that may have received more than one primary image from
-- separate upload batches, then enforce one global primary photograph per product.
with ranked as (
  select id,
         row_number() over (
           partition by product_id
           order by is_primary desc, sort_order asc, created_at asc, id asc
         ) as position
  from public.product_images
)
update public.product_images image
set is_primary = (ranked.position = 1)
from ranked
where image.id = ranked.id
  and image.is_primary is distinct from (ranked.position = 1);

create unique index if not exists product_images_one_primary_idx
  on public.product_images(product_id)
  where is_primary;

