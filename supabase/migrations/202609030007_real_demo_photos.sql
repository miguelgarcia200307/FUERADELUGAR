with photo_map(product_id, color_name, file_name) as (
  values
  ('10000000-0000-0000-0000-000000000001'::uuid,'Blanco','jersey-white.jpg'),
  ('10000000-0000-0000-0000-000000000001'::uuid,'Negro','jersey-number.jpg'),
  ('10000000-0000-0000-0000-000000000001'::uuid,'Verde','jersey-blue.jpg'),
  ('10000000-0000-0000-0000-000000000002'::uuid,'Blanco','jersey-blue.jpg'),
  ('10000000-0000-0000-0000-000000000002'::uuid,'Negro','jersey-number.jpg'),
  ('10000000-0000-0000-0000-000000000002'::uuid,'Verde','jersey-red-action.jpg'),
  ('10000000-0000-0000-0000-000000000003'::uuid,'Blanco','jersey-red-kick.jpg'),
  ('10000000-0000-0000-0000-000000000003'::uuid,'Negro','jersey-number.jpg'),
  ('10000000-0000-0000-0000-000000000003'::uuid,'Verde','goalkeeper.jpg'),
  ('10000000-0000-0000-0000-000000000004'::uuid,'Blanco','jersey-white.jpg'),
  ('10000000-0000-0000-0000-000000000004'::uuid,'Negro','jersey-number.jpg'),
  ('10000000-0000-0000-0000-000000000004'::uuid,'Verde','jersey-blue.jpg'),
  ('10000000-0000-0000-0000-000000000005'::uuid,'Blanco','jersey-red-action.jpg'),
  ('10000000-0000-0000-0000-000000000005'::uuid,'Negro','goalkeeper.jpg'),
  ('10000000-0000-0000-0000-000000000005'::uuid,'Verde','jersey-red-kick.jpg'),
  ('10000000-0000-0000-0000-000000000006'::uuid,'Blanco','jersey-white.jpg'),
  ('10000000-0000-0000-0000-000000000006'::uuid,'Negro','jersey-number.jpg'),
  ('10000000-0000-0000-0000-000000000006'::uuid,'Verde','jersey-red-kick.jpg'),
  ('10000000-0000-0000-0000-000000000007'::uuid,'Negro','cleats-style.jpg'),
  ('10000000-0000-0000-0000-000000000007'::uuid,'Azul','cleats-field.jpg'),
  ('10000000-0000-0000-0000-000000000008'::uuid,'Negro','cleats-hand.jpg'),
  ('10000000-0000-0000-0000-000000000008'::uuid,'Azul','cleats-ball.jpg'),
  ('10000000-0000-0000-0000-000000000009'::uuid,'Negro','cleats-style.jpg'),
  ('10000000-0000-0000-0000-000000000009'::uuid,'Azul','cleats-field.jpg'),
  ('10000000-0000-0000-0000-000000000010'::uuid,'Negro','soccer-ball.jpg'),
  ('10000000-0000-0000-0000-000000000010'::uuid,'Azul','cleats-ball.jpg'),
  ('10000000-0000-0000-0000-000000000011'::uuid,'Negro','cleats-field.jpg'),
  ('10000000-0000-0000-0000-000000000011'::uuid,'Azul','cleats-ball.jpg'),
  ('10000000-0000-0000-0000-000000000012'::uuid,'Negro','gym-man-bag.jpg'),
  ('10000000-0000-0000-0000-000000000012'::uuid,'Azul','gym-bag-urban.jpg'),
  ('10000000-0000-0000-0000-000000000013'::uuid,'Blanco','gym-man-bag.jpg'),
  ('10000000-0000-0000-0000-000000000013'::uuid,'Negro','gym-boxing.jpg'),
  ('10000000-0000-0000-0000-000000000013'::uuid,'Verde','gym-woman-bag.jpg'),
  ('10000000-0000-0000-0000-000000000014'::uuid,'Blanco','gym-woman-bag.jpg'),
  ('10000000-0000-0000-0000-000000000014'::uuid,'Negro','gym-bag-urban.jpg'),
  ('10000000-0000-0000-0000-000000000014'::uuid,'Verde','gym-boxing.jpg'),
  ('10000000-0000-0000-0000-000000000015'::uuid,'Negro','goalkeeper.jpg'),
  ('10000000-0000-0000-0000-000000000015'::uuid,'Azul','jersey-red-action.jpg'),
  ('10000000-0000-0000-0000-000000000016'::uuid,'Negro','cleats-style.jpg'),
  ('10000000-0000-0000-0000-000000000016'::uuid,'Azul','cleats-field.jpg'),
  ('10000000-0000-0000-0000-000000000017'::uuid,'Blanco','jersey-white.jpg'),
  ('10000000-0000-0000-0000-000000000017'::uuid,'Negro','jersey-number.jpg'),
  ('10000000-0000-0000-0000-000000000017'::uuid,'Verde','jersey-red-action.jpg'),
  ('10000000-0000-0000-0000-000000000018'::uuid,'Blanco','gym-man-bag.jpg'),
  ('10000000-0000-0000-0000-000000000018'::uuid,'Negro','gym-bag-urban.jpg'),
  ('10000000-0000-0000-0000-000000000018'::uuid,'Verde','gym-boxing.jpg')
)
update public.product_images image
set url = 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/product-images/demo-stock/' || photo_map.file_name,
    alt_text = product.name || ' · fotografía demostrativa'
from photo_map
join public.product_colors color
  on color.product_id = photo_map.product_id
 and color.name = photo_map.color_name
join public.products product
  on product.id = photo_map.product_id
where image.product_id = photo_map.product_id
  and image.color_id = color.id;

