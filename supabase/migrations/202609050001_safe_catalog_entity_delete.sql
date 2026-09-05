create or replace function public.catalog_entity_dependencies(entity_type text, entity_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  product_count integer := 0;
  child_count integer := 0;
  entity_exists boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;

  case entity_type
    when 'categories' then
      select exists(select 1 from public.categories where id = entity_id) into entity_exists;
      select count(*) into product_count from public.product_categories where category_id = entity_id;
      select count(*) into child_count from public.categories where parent_id = entity_id;
    when 'teams' then
      select exists(select 1 from public.teams where id = entity_id) into entity_exists;
      select count(*) into product_count from public.products where team_id = entity_id;
    when 'brands' then
      select exists(select 1 from public.brands where id = entity_id) into entity_exists;
      select count(*) into product_count from public.products where brand_id = entity_id;
    else
      raise exception 'Tipo de entidad no válido' using errcode = '22023';
  end case;

  return jsonb_build_object(
    'exists', entity_exists,
    'product_count', product_count,
    'child_count', child_count,
    'can_delete', entity_exists and product_count = 0 and child_count = 0
  );
end;
$$;

create or replace function public.delete_catalog_entity_safely(entity_type text, entity_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  dependencies jsonb;
  entity_exists boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;

  if entity_type = 'categories' then
    perform 1 from public.categories where id = entity_id for update;
  elsif entity_type = 'teams' then
    perform 1 from public.teams where id = entity_id for update;
  elsif entity_type = 'brands' then
    perform 1 from public.brands where id = entity_id for update;
  else
    raise exception 'Tipo de entidad no válido' using errcode = '22023';
  end if;
  entity_exists := found;

  if not entity_exists then
    return jsonb_build_object('exists', false, 'can_delete', false, 'deleted', false, 'reason', 'not_found', 'product_count', 0, 'child_count', 0);
  end if;

  dependencies := public.catalog_entity_dependencies(entity_type, entity_id);
  if coalesce((dependencies->>'child_count')::integer, 0) > 0 then
    return dependencies || jsonb_build_object('deleted', false, 'reason', 'children');
  end if;
  if coalesce((dependencies->>'product_count')::integer, 0) > 0 then
    return dependencies || jsonb_build_object('deleted', false, 'reason', 'products');
  end if;

  case entity_type
    when 'categories' then delete from public.categories where id = entity_id;
    when 'teams' then delete from public.teams where id = entity_id;
    when 'brands' then delete from public.brands where id = entity_id;
  end case;

  return dependencies || jsonb_build_object('deleted', true, 'reason', null);
end;
$$;

revoke all on function public.catalog_entity_dependencies(text, uuid) from public;
revoke all on function public.delete_catalog_entity_safely(text, uuid) from public;
grant execute on function public.catalog_entity_dependencies(text, uuid) to authenticated;
grant execute on function public.delete_catalog_entity_safely(text, uuid) to authenticated;
