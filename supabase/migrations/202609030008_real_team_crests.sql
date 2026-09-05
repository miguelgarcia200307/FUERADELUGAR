update public.teams
set crest_url = case slug
  when 'argentina' then 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/team-crests/demo/argentina.svg'
  when 'barcelona' then 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/team-crests/demo/barcelona.svg'
  when 'colombia' then 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/team-crests/demo/colombia.svg'
  when 'junior' then 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/team-crests/demo/junior.svg'
  when 'nacional' then 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/team-crests/demo/nacional.svg'
  when 'real-madrid' then 'https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/team-crests/demo/real-madrid.png'
  else crest_url
end
where slug in ('argentina', 'barcelona', 'colombia', 'junior', 'nacional', 'real-madrid');
