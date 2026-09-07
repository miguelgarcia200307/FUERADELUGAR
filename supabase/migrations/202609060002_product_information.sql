alter table public.products
  add column if not exists care_instructions text,
  add column if not exists purchase_delivery_info text;

comment on column public.products.care_instructions is
  'Optional product-specific care instructions shown in the storefront.';

comment on column public.products.purchase_delivery_info is
  'Optional product-specific purchasing and delivery information shown in the storefront.';
