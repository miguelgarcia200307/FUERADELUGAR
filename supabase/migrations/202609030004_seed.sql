insert into public.categories (id, parent_id, name, slug, sort_order) values
('20000000-0000-0000-0000-000000000001', null, 'Promo', 'promo', 0),
('20000000-0000-0000-0000-000000000002', null, 'Uniformes de fútbol adulto', 'uniformes-futbol-adulto', 10),
('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Clubes', 'clubes-adulto', 1),
('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'Selecciones', 'selecciones-adulto', 2),
('20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Equipos colombianos', 'equipos-colombianos-adulto', 3),
('20000000-0000-0000-0000-000000000006', null, 'Uniformes de fútbol niño', 'uniformes-futbol-nino', 20),
('20000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000006', 'Clubes', 'clubes-nino', 1),
('20000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000006', 'Selecciones', 'selecciones-nino', 2),
('20000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000006', 'Equipos colombianos', 'equipos-colombianos-nino', 3),
('20000000-0000-0000-0000-000000000010', null, 'Camisetas versión jugador', 'camisetas-version-jugador', 30),
('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000010', 'Clubes', 'clubes-version-jugador', 1),
('20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000010', 'Selecciones', 'selecciones-version-jugador', 2),
('20000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000010', 'Equipos colombianos', 'equipos-colombianos-version-jugador', 3),
('20000000-0000-0000-0000-000000000014', null, 'Guayos', 'guayos', 40),
('20000000-0000-0000-0000-000000000015', null, 'Zapatillas', 'zapatillas', 50),
('20000000-0000-0000-0000-000000000016', null, 'Accesorios', 'accesorios', 60),
('20000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000016', 'Balones', 'balones', 1),
('20000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000016', 'Boxeo', 'boxeo', 2),
('20000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000016', 'Bufandas', 'bufandas', 3),
('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000016', 'Canilleras', 'canilleras', 4),
('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000016', 'Gym', 'gym', 5),
('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000016', 'Implementos deportivos', 'implementos-deportivos', 6),
('20000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000016', 'Medias', 'medias', 7),
('20000000-0000-0000-0000-000000000024', '20000000-0000-0000-0000-000000000016', 'Natación', 'natacion', 8),
('20000000-0000-0000-0000-000000000025', '20000000-0000-0000-0000-000000000016', 'Parches', 'parches', 9),
('20000000-0000-0000-0000-000000000026', '20000000-0000-0000-0000-000000000016', 'Patinaje', 'patinaje', 10),
('20000000-0000-0000-0000-000000000027', '20000000-0000-0000-0000-000000000016', 'Porteros', 'porteros', 11),
('20000000-0000-0000-0000-000000000028', '20000000-0000-0000-0000-000000000016', 'Tenis', 'tenis', 12),
('20000000-0000-0000-0000-000000000029', '20000000-0000-0000-0000-000000000016', 'Trofeos', 'trofeos', 13),
('20000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000016', 'Voleibol', 'voleibol', 14),
('20000000-0000-0000-0000-000000000031', null, 'Bolsos', 'bolsos', 70),
('20000000-0000-0000-0000-000000000032', null, 'Ropa deportiva', 'ropa-deportiva', 80),
('20000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000032', 'Caballero', 'ropa-caballero', 1),
('20000000-0000-0000-0000-000000000034', '20000000-0000-0000-0000-000000000032', 'Dama', 'ropa-dama', 2),
('20000000-0000-0000-0000-000000000035', '20000000-0000-0000-0000-000000000032', 'Niño', 'ropa-nino', 3),
('20000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000032', 'Niña', 'ropa-nina', 4)
on conflict (id) do nothing;

insert into public.teams (id, name, slug, type) values
('30000000-0000-0000-0000-000000000001','Argentina','argentina','national_team'),
('30000000-0000-0000-0000-000000000002','Barcelona','barcelona','club'),
('30000000-0000-0000-0000-000000000003','Colombia','colombia','national_team'),
('30000000-0000-0000-0000-000000000004','Junior','junior','colombian_team'),
('30000000-0000-0000-0000-000000000005','Nacional','nacional','colombian_team'),
('30000000-0000-0000-0000-000000000006','Real Madrid','real-madrid','club')
on conflict (id) do nothing;

insert into public.brands (id, name, slug) values
('40000000-0000-0000-0000-000000000001','Adidas','adidas'),
('40000000-0000-0000-0000-000000000002','Nike','nike'),
('40000000-0000-0000-0000-000000000003','Puma','puma'),
('40000000-0000-0000-0000-000000000004','Sport Pro','sport-pro')
on conflict (id) do nothing;

insert into public.products (
  id, name, slug, description, material, base_price, promo_price, promo_start, promo_end,
  status, team_id, brand_id, featured, is_personalizable, personalization_price,
  allow_logo, force_last_units, force_sold_out, size_guide_text, created_at
) values
('10000000-0000-0000-0000-000000000001','Camiseta Real Madrid local 2026','camiseta-real-madrid-local-2026','Camiseta local inspirada en la temporada 2026, fresca y de secado rápido.','Poliéster deportivo',120000,90000,now()-interval '10 days',now()+interval '30 days','published','30000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000001',true,true,18000,true,false,false,'Mide el contorno del pecho. S: 88–94 cm, M: 95–101 cm, L: 102–108 cm, XL: 109–116 cm.',now()-interval '1 day'),
('10000000-0000-0000-0000-000000000002','Camiseta Barcelona visitante','camiseta-barcelona-visitante','Edición visitante con tacto suave y ajuste deportivo.','Poliéster transpirable',115000,null,null,null,'published','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002',true,true,18000,true,false,false,'S a XXL. Elige tu talla habitual.',now()-interval '3 days'),
('10000000-0000-0000-0000-000000000003','Camiseta Selección Colombia amarilla','camiseta-colombia-amarilla','La pasión de la Selección Colombia en una camiseta cómoda.','Poliéster deportivo',110000,88000,now()-interval '2 days',now()+interval '20 days','published','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001',true,true,15000,true,true,false,'S: 88–94 cm · M: 95–101 cm · L: 102–108 cm.',now()-interval '2 days'),
('10000000-0000-0000-0000-000000000004','Camiseta Argentina campeones','camiseta-argentina-campeones','Diseño de selección con acabados bordados.','Poliéster premium',125000,null,null,null,'published','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',false,true,18000,true,false,false,'Corte regular.',now()-interval '7 days'),
('10000000-0000-0000-0000-000000000005','Uniforme Junior local adulto','uniforme-junior-local-adulto','Conjunto camiseta y pantaloneta para adulto.','Microfibra deportiva',140000,119000,now()-interval '4 days',now()+interval '15 days','published','30000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004',true,true,20000,true,false,false,'Incluye camiseta y pantaloneta.',now()-interval '5 days'),
('10000000-0000-0000-0000-000000000006','Uniforme Nacional niño','uniforme-nacional-nino','Conjunto infantil cómodo para jugar y alentar.','Poliéster suave',95000,null,null,null,'published','30000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000004',false,true,15000,true,false,false,'Tallas infantiles por edad.',now()-interval '8 days'),
('10000000-0000-0000-0000-000000000007','Guayos velocidad FG negros','guayos-velocidad-fg-negros','Tracción para cancha natural y ajuste firme.','Sintético',210000,179000,now()-interval '1 day',now()+interval '12 days','published',null,'40000000-0000-0000-0000-000000000002',true,false,0,false,false,false,'Tallaje colombiano 36 a 42.',now()-interval '4 days'),
('10000000-0000-0000-0000-000000000008','Guayos control turf','guayos-control-turf','Suela multitaco para terreno sintético.','Sintético texturizado',185000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000001',false,false,0,false,false,false,'Tallaje colombiano 36 a 42.',now()-interval '11 days'),
('10000000-0000-0000-0000-000000000009','Zapatillas urban sport','zapatillas-urban-sport','Comodidad ligera para todos los días.','Malla y goma',165000,139000,now()-interval '3 days',now()+interval '21 days','published',null,'40000000-0000-0000-0000-000000000003',false,false,0,false,false,false,'Tallaje colombiano 35 a 41.',now()-interval '6 days'),
('10000000-0000-0000-0000-000000000010','Balón fútbol match Nº 5','balon-futbol-match-numero-5','Balón cosido de excelente respuesta para entrenamiento.','PU laminado',85000,69000,now()-interval '5 days',now()+interval '25 days','published',null,'40000000-0000-0000-0000-000000000004',true,false,0,false,false,false,'Tamaño oficial Nº 5.',now()-interval '10 days'),
('10000000-0000-0000-0000-000000000011','Canilleras flex pro','canilleras-flex-pro','Protección liviana con ajuste anatómico.','Polipropileno y EVA',48000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000002',false,false,0,false,false,false,'S para niño, M/L para adulto.',now()-interval '13 days'),
('10000000-0000-0000-0000-000000000012','Bolso deportivo training','bolso-deportivo-training','Amplio compartimento principal y bolsillo para calzado.','Poliéster reforzado',98000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000003',false,false,0,false,false,false,'Capacidad 35 litros.',now()-interval '15 days'),
('10000000-0000-0000-0000-000000000013','Conjunto training caballero','conjunto-training-caballero','Camiseta y pantaloneta para entrenamiento.','Dry-fit',105000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000002',false,false,0,false,false,false,'S a XL.',now()-interval '18 days'),
('10000000-0000-0000-0000-000000000014','Leggings performance dama','leggings-performance-dama','Pretina alta y tejido flexible de alto soporte.','Nylon y elastano',92000,79000,now()-interval '1 day',now()+interval '10 days','published',null,'40000000-0000-0000-0000-000000000003',true,false,0,false,true,false,'XS a L.',now()-interval '2 days'),
('10000000-0000-0000-0000-000000000015','Guantes de portero grip','guantes-portero-grip','Palma de látex con buen agarre en seco.','Látex y malla',115000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000004',false,false,0,false,false,false,'Tallas 7 a 10.',now()-interval '20 days'),
('10000000-0000-0000-0000-000000000016','Medias fútbol compresión','medias-futbol-compresion','Soporte elástico y ventilación localizada.','Poliamida',32000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000004',false,false,0,false,false,false,'Talla única adulto.',now()-interval '21 days'),
('10000000-0000-0000-0000-000000000017','Camiseta Real Madrid negra edición especial','camiseta-real-madrid-negra-especial','Edición especial en negro con detalles contrastantes.','Poliéster premium',135000,108000,now()-interval '2 days',now()+interval '18 days','published','30000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000001',true,true,18000,true,false,false,'S a XXL.',now()-interval '1 hour'),
('10000000-0000-0000-0000-000000000018','Chaqueta deportiva rompevientos','chaqueta-deportiva-rompevientos','Protección ligera contra viento y lluvia suave.','Poliéster repelente',175000,null,null,null,'published',null,'40000000-0000-0000-0000-000000000004',false,false,0,false,false,false,'S a XL.',now()-interval '25 days')
on conflict (id) do nothing;

insert into public.product_categories (product_id, category_id) values
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003'),('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003'),
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004'),('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000010'),('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000012'),
('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005'),('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000006'),('10000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000009'),
('10000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000014'),('10000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000014'),
('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000015'),('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000017'),('10000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000020'),
('10000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000031'),
('10000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000033'),
('10000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-000000000034'),('10000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-000000000027'),
('10000000-0000-0000-0000-000000000016','20000000-0000-0000-0000-000000000023'),
('10000000-0000-0000-0000-000000000017','20000000-0000-0000-0000-000000000010'),('10000000-0000-0000-0000-000000000017','20000000-0000-0000-0000-000000000011'),('10000000-0000-0000-0000-000000000017','20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000018','20000000-0000-0000-0000-000000000033')
on conflict do nothing;

-- Demo options. They remain fully editable from the administrator.
insert into public.product_colors (product_id, name, hex_code, sort_order)
select p.id, v.name, v.hex, v.ord
from public.products p
cross join (values ('Blanco','#F7F7F4',1),('Negro','#171717',2),('Verde','#18864B',3)) v(name,hex,ord)
where p.id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000017','10000000-0000-0000-0000-000000000018'
)
on conflict do nothing;

insert into public.product_colors (product_id, name, hex_code, sort_order)
select p.id, v.name, v.hex, v.ord
from public.products p
cross join (values ('Negro','#171717',1),('Azul','#1455A0',2)) v(name,hex,ord)
where p.id between '10000000-0000-0000-0000-000000000007' and '10000000-0000-0000-0000-000000000012'
   or p.id in ('10000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000016')
on conflict do nothing;

insert into public.product_sizes (product_id, name, sort_order)
select p.id, v.name, v.ord
from public.products p
cross join (values ('S',1),('M',2),('L',3),('XL',4)) v(name,ord)
where p.id not in ('10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000016')
on conflict do nothing;

insert into public.product_sizes (product_id, name, sort_order)
select '10000000-0000-0000-0000-000000000006', v.name, v.ord from (values ('6',1),('8',2),('10',3),('12',4),('14',5)) v(name,ord)
on conflict do nothing;
insert into public.product_sizes (product_id, name, sort_order)
select p.id, v.name, v.ord from public.products p cross join (values ('36',1),('37',2),('38',3),('39',4),('40',5),('41',6),('42',7)) v(name,ord)
where p.id in ('10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009')
on conflict do nothing;
insert into public.product_sizes (product_id, name, sort_order) values
('10000000-0000-0000-0000-000000000010','Única',1),('10000000-0000-0000-0000-000000000012','Única',1),('10000000-0000-0000-0000-000000000016','Única',1)
on conflict do nothing;

insert into public.product_variants (product_id, color_id, size_id, stock)
select p.id, c.id, s.id,
  case
    when p.force_sold_out then 0
    when p.id = '10000000-0000-0000-0000-000000000003' and s.name = 'M' then 2
    when p.id = '10000000-0000-0000-0000-000000000001' and c.name = 'Negro' and s.name = 'L' then 0
    else 4 + ((c.sort_order + s.sort_order) % 6)
  end
from public.products p
join public.product_colors c on c.product_id = p.id
join public.product_sizes s on s.product_id = p.id
on conflict do nothing;

insert into public.product_images (product_id, color_id, url, alt_text, is_primary, sort_order)
select p.id, c.id,
  case c.name
    when 'Negro' then 'assets/images/product-black.svg'
    when 'Verde' then 'assets/images/product-green.svg'
    when 'Azul' then 'assets/images/product-blue.svg'
    else 'assets/images/product-white.svg'
  end,
  p.name || ' en color ' || c.name,
  c.sort_order = 1,
  c.sort_order
from public.products p
join public.product_colors c on c.product_id = p.id
on conflict do nothing;

insert into public.payment_methods (name, instructions, active, sort_order) values
('Daviplata','La tienda enviará los datos para transferir y confirmará el pago por WhatsApp.',true,1),
('Bancolombia','La tienda enviará los datos de la cuenta y confirmará el pago por WhatsApp.',true,2),
('Efectivo','Disponible para recogida en tienda o según confirmación del domicilio.',true,3)
on conflict (name) do nothing;

