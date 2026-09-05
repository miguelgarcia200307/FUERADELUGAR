alter table public.payment_methods
add column if not exists logo_url text;

comment on column public.payment_methods.logo_url is
'URL pública opcional del logo mostrado para el método de pago.';
