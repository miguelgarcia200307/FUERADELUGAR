-- The check constraint invokes this validator during authenticated admin writes.
-- RLS still limits site_settings changes to public.is_admin().
grant execute on function public.is_valid_announcement_messages(jsonb) to authenticated;
