-- Production try-on clothing taxonomy, managed system reference scenes,
-- and clothing analysis cache. Apply after admin-console.sql.

create extension if not exists pgcrypto;

create table if not exists public.tryon_clothing_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  parent_code text references public.tryon_clothing_categories(code) on update cascade on delete restrict,
  level integer not null check (level in (1, 2)),
  name_zh text not null,
  name_en text not null,
  slot text not null check (slot in ('upper', 'lower', 'single', 'outer', 'intimate', 'functional')),
  is_intimate boolean not null default false,
  aliases jsonb not null default '[]'::jsonb,
  recognition_labels jsonb not null default '[]'::jsonb,
  default_view_tags text[] not null default '{}',
  default_crop_tags text[] not null default '{}',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tryon_reference_scenes (
  id uuid primary key default gen_random_uuid(),
  scene_key text not null unique,
  external_scene_id text,
  name text not null,
  image_url text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  priority integer not null default 0,
  sort_order integer not null default 0,
  cloth_categories text[] not null default '{}',
  gender text not null default 'all' check (gender in ('women', 'men', 'unisex', 'all')),
  age_ranges text[] not null default '{adult}',
  view_tags text[] not null default '{}',
  crop_tags text[] not null default '{}',
  scene_tags text[] not null default '{}',
  style_tags text[] not null default '{}',
  lens text,
  posture text,
  prompt_tags text[] not null default '{}',
  raw_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tryon_reference_scenes_active_ready check (
    status <> 'active'
    or (
      length(trim(name)) > 0
      and length(trim(image_url)) > 0
      and (
        coalesce(array_length(cloth_categories, 1), 0) > 0
        or coalesce(array_length(scene_tags, 1), 0) > 0
        or coalesce(array_length(style_tags, 1), 0) > 0
      )
    )
  )
);

create table if not exists public.tryon_clothing_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  image_url_hash text not null unique,
  clothing_urls text[] not null default '{}',
  clothing_mode text,
  garment_audience text,
  age_group text,
  main_category text,
  subcategories text[] not null default '{}',
  cloth_type_raw text,
  description text,
  gender_type text,
  age_range text,
  slot text,
  fit text,
  confidence numeric(4, 3) not null default 0,
  provider text not null default 'yunwu',
  model text not null default 'gpt-5-nano',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tryon_clothing_categories_parent_idx
  on public.tryon_clothing_categories(parent_code, sort_order);

create index if not exists tryon_clothing_categories_enabled_idx
  on public.tryon_clothing_categories(enabled, level, sort_order);

create index if not exists tryon_reference_scenes_status_sort_idx
  on public.tryon_reference_scenes(status, sort_order, priority desc);

create index if not exists tryon_reference_scenes_gender_idx
  on public.tryon_reference_scenes(gender);

create index if not exists tryon_reference_scenes_cloth_categories_gin
  on public.tryon_reference_scenes using gin(cloth_categories);

create index if not exists tryon_reference_scenes_age_ranges_gin
  on public.tryon_reference_scenes using gin(age_ranges);

create index if not exists tryon_reference_scenes_tags_gin
  on public.tryon_reference_scenes using gin(scene_tags, style_tags);

create index if not exists tryon_clothing_analysis_cache_hash_idx
  on public.tryon_clothing_analysis_cache(image_url_hash);

create or replace function public.set_tryon_reference_config_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tryon_clothing_categories_updated_at on public.tryon_clothing_categories;
create trigger trg_tryon_clothing_categories_updated_at
before update on public.tryon_clothing_categories
for each row execute function public.set_tryon_reference_config_updated_at();

drop trigger if exists trg_tryon_reference_scenes_updated_at on public.tryon_reference_scenes;
create trigger trg_tryon_reference_scenes_updated_at
before update on public.tryon_reference_scenes
for each row execute function public.set_tryon_reference_config_updated_at();

drop trigger if exists trg_tryon_clothing_analysis_cache_updated_at on public.tryon_clothing_analysis_cache;
create trigger trg_tryon_clothing_analysis_cache_updated_at
before update on public.tryon_clothing_analysis_cache
for each row execute function public.set_tryon_reference_config_updated_at();

alter table public.tryon_clothing_categories enable row level security;
alter table public.tryon_reference_scenes enable row level security;
alter table public.tryon_clothing_analysis_cache enable row level security;

drop policy if exists "tryon clothing categories public read" on public.tryon_clothing_categories;
create policy "tryon clothing categories public read"
on public.tryon_clothing_categories
for select
using (enabled = true);

drop policy if exists "tryon reference scenes public read" on public.tryon_reference_scenes;
create policy "tryon reference scenes public read"
on public.tryon_reference_scenes
for select
using (status = 'active');

-- Cache and write operations are intentionally service-role only.

insert into public.tryon_clothing_categories
  (code, parent_code, level, name_zh, name_en, slot, is_intimate, aliases, recognition_labels, default_view_tags, default_crop_tags, enabled, sort_order, metadata)
values
  ('outerwear', null, 1, '外套', 'Outerwear', 'outer', false, '["外套","Outerwear","outerwear"]', '["outerwear","outerwear"]', '{whole_body,front_view}', '{full_body}', true, 10, '{}'),
  ('loose_top', 'outerwear', 2, '宽松外套', 'Loose outer top', 'outer', false, '["宽松外套","Loose outer top","loose_top","loose top","loose jacket","oversized jacket"]', '["loose outer top","loose_top","loose outerwear","oversized outerwear"]', '{whole_body,front_view}', '{full_body}', true, 11, '{}'),
  ('fitted_top', 'outerwear', 2, '合身外套', 'Fitted outer top', 'outer', false, '["合身外套","Fitted outer top","fitted_top","fitted jacket","tailored jacket","slim jacket"]', '["fitted outer top","fitted_top","fitted outerwear","tailored outerwear"]', '{whole_body,front_view}', '{full_body}', true, 12, '{}'),
  ('overcoat', 'outerwear', 2, '大衣', 'Overcoat', 'outer', false, '["大衣","Overcoat","overcoat","coat","trench coat"]', '["overcoat","coat","long coat"]', '{whole_body,front_view}', '{full_body}', true, 13, '{}'),
  ('shawl', 'outerwear', 2, '披肩', 'Shawl', 'outer', false, '["披肩","Shawl","shawl","wrap","capelet"]', '["shawl","wrap outerwear"]', '{whole_body,front_view}', '{full_body}', true, 14, '{}'),
  ('down_jacket', 'outerwear', 2, '羽绒服', 'Down jacket', 'outer', false, '["羽绒服","Down jacket","down_jacket","puffer","puffer jacket"]', '["down jacket","puffer jacket"]', '{whole_body,front_view}', '{full_body}', true, 15, '{}'),
  ('fur_coat', 'outerwear', 2, '皮草', 'Fur coat', 'outer', false, '["皮草","Fur coat","fur_coat","faux fur"]', '["fur coat","faux fur coat"]', '{whole_body,front_view}', '{full_body}', true, 16, '{}'),
  ('suit_set', 'outerwear', 2, '西装多件套', 'Suit set', 'outer', false, '["西装多件套","Suit set","suit_set","suit","blazer set"]', '["suit set","blazer suit"]', '{whole_body,front_view}', '{full_body}', true, 17, '{}'),
  ('single_piece_top', null, 1, '单件上衣', 'Single piece top', 'upper', false, '["单件上衣","Single piece top","single_piece_top"]', '["single piece top","single_piece_top"]', '{upper_body,whole_body,front_view}', '{upper_body,half_body}', true, 20, '{}'),
  ('single_loose_top', 'single_piece_top', 2, '单件宽松款上衣', 'Loose single top', 'upper', false, '["单件宽松款上衣","Loose single top","single_loose_top","loose shirt","oversized t-shirt","loose blouse"]', '["loose single top","single_loose_top","loose upper garment","loose top"]', '{upper_body,whole_body,front_view}', '{upper_body,half_body}', true, 21, '{}'),
  ('single_fitted_top', 'single_piece_top', 2, '单件合身款上衣', 'Fitted single top', 'upper', false, '["单件合身款上衣","Fitted single top","single_fitted_top","fitted top","tank top","sleeveless top","ribbed top","slim top"]', '["fitted single top","single_fitted_top","upper garment","fitted top","tank top","sleeveless top"]', '{upper_body,whole_body,front_view}', '{upper_body,half_body}', true, 22, '{}'),
  ('bottom_skirt', null, 1, '下身裙子', 'Bottom skirt', 'lower', false, '["下身裙子","Bottom skirt","bottom_skirt"]', '["bottom skirt","bottom_skirt"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 30, '{}'),
  ('wrap_skirt', 'bottom_skirt', 2, '裹身裙', 'Wrap skirt', 'lower', false, '["裹身裙","Wrap skirt","wrap_skirt"]', '["wrap skirt","wrap_skirt"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 31, '{}'),
  ('wrap_maxi_skirt', 'bottom_skirt', 2, '裹身及地裙', 'Wrap maxi skirt', 'lower', false, '["裹身及地裙","Wrap maxi skirt","wrap_maxi_skirt","long wrap skirt"]', '["wrap maxi skirt","wrap_maxi_skirt"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 32, '{}'),
  ('short_skirt', 'bottom_skirt', 2, '短裙', 'Short skirt', 'lower', false, '["短裙","Short skirt","short_skirt","mini skirt"]', '["short skirt","short_skirt","mini skirt"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 33, '{}'),
  ('aline_skirt', 'bottom_skirt', 2, '伞裙', 'A-line skirt', 'lower', false, '["伞裙","A-line skirt","aline_skirt","aline skirt","flared skirt"]', '["a-line skirt","aline_skirt","flared skirt"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 34, '{}'),
  ('aline_maxi_skirt', 'bottom_skirt', 2, '伞裙及地裙', 'A-line maxi skirt', 'lower', false, '["伞裙及地裙","A-line maxi skirt","aline_maxi_skirt","long flared skirt"]', '["a-line maxi skirt","aline_maxi_skirt"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 35, '{}'),
  ('bottom_pants', null, 1, '下身裤子', 'Bottom pants', 'lower', false, '["下身裤子","Bottom pants","bottom_pants"]', '["bottom pants","bottom_pants"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 40, '{}'),
  ('shorts', 'bottom_pants', 2, '短裤', 'Shorts', 'lower', false, '["短裤","Shorts","shorts"]', '["shorts"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 41, '{}'),
  ('long_pants', 'bottom_pants', 2, '长裤', 'Long pants', 'lower', false, '["长裤","Long pants","long_pants","pants","trousers","jeans","wide leg pants"]', '["long pants","long_pants","pants","trousers","jeans"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 42, '{}'),
  ('overalls', 'bottom_pants', 2, '背带裤', 'Overalls', 'single', false, '["背带裤","Overalls","overalls","dungarees"]', '["overalls"]', '{whole_body,front_view}', '{full_body}', true, 43, '{}'),
  ('dress', null, 1, '连衣裙', 'Dress', 'single', false, '["连衣裙","Dress","dress"]', '["dress"]', '{whole_body,front_view}', '{full_body}', true, 50, '{}'),
  ('wrap_short_dress', 'dress', 2, '裹身短连衣裙', 'Wrap short dress', 'single', false, '["裹身短连衣裙","Wrap short dress","wrap_short_dress","short wrap dress"]', '["wrap short dress","wrap_short_dress"]', '{whole_body,front_view}', '{full_body}', true, 51, '{}'),
  ('wrap_dress', 'dress', 2, '裹身连衣裙', 'Wrap dress', 'single', false, '["裹身连衣裙","Wrap dress","wrap_dress"]', '["wrap dress","wrap_dress"]', '{whole_body,front_view}', '{full_body}', true, 52, '{}'),
  ('aline_short_dress', 'dress', 2, '伞裙短连衣裙', 'A-line short dress', 'single', false, '["伞裙短连衣裙","A-line short dress","aline_short_dress","short a-line dress"]', '["a-line short dress","aline_short_dress"]', '{whole_body,front_view}', '{full_body}', true, 53, '{}'),
  ('aline_dress', 'dress', 2, '伞裙连衣裙', 'A-line dress', 'single', false, '["伞裙连衣裙","A-line dress","aline_dress","flared dress"]', '["a-line dress","aline_dress"]', '{whole_body,front_view}', '{full_body}', true, 54, '{}'),
  ('underwear', null, 1, '内衣裤', 'Underwear', 'intimate', true, '["内衣裤","Underwear","underwear"]', '["underwear"]', '{whole_body,front_view}', '{full_body}', true, 60, '{}'),
  ('swimsuit', 'underwear', 2, '泳衣', 'Swimsuit', 'intimate', true, '["泳衣","Swimsuit","swimsuit","bikini","swimwear"]', '["swimsuit","swimwear"]', '{whole_body,front_view}', '{full_body}', true, 61, '{}'),
  ('underwear_set', 'underwear', 2, '内衣裤', 'Underwear set', 'intimate', true, '["内衣裤","Underwear set","underwear_set","bra","panties"]', '["underwear set","underwear_set"]', '{whole_body,front_view}', '{full_body}', true, 62, '{}'),
  ('sexy_lingerie', 'underwear', 2, '情趣内衣', 'Sexy lingerie', 'intimate', true, '["情趣内衣","Sexy lingerie","sexy_lingerie","lingerie"]', '["lingerie","sexy_lingerie"]', '{whole_body,front_view}', '{full_body}', true, 63, '{}'),
  ('functional_wear', null, 1, '功能性服装', 'Functional wear', 'functional', false, '["功能性服装","Functional wear","functional_wear"]', '["functional wear","functional_wear"]', '{whole_body,front_view}', '{full_body}', true, 70, '{}'),
  ('cape', 'functional_wear', 2, '斗篷', 'Cape', 'outer', false, '["斗篷","Cape","cape"]', '["cape"]', '{whole_body,front_view}', '{full_body}', true, 71, '{}'),
  ('raincoat', 'functional_wear', 2, '雨衣', 'Raincoat', 'outer', false, '["雨衣","Raincoat","raincoat"]', '["raincoat"]', '{whole_body,front_view}', '{full_body}', true, 72, '{}'),
  ('costume', 'functional_wear', 2, '道具类服装', 'Costume', 'functional', false, '["道具类服装","Costume","costume","cosplay"]', '["costume"]', '{whole_body,front_view}', '{full_body}', true, 73, '{}'),
  ('ballet_skirt', 'functional_wear', 2, '芭蕾舞裙', 'Ballet skirt', 'lower', false, '["芭蕾舞裙","Ballet skirt","ballet_skirt","tutu"]', '["ballet skirt","ballet_skirt","tutu"]', '{whole_body,lower_body,front_view}', '{full_body,lower_body}', true, 74, '{}'),
  ('pajamas', 'functional_wear', 2, '睡衣', 'Pajamas', 'single', false, '["睡衣","Pajamas","pajamas","sleepwear"]', '["pajamas","sleepwear"]', '{whole_body,front_view}', '{full_body}', true, 75, '{}'),
  ('sports_wear', null, 1, '运动类', 'Sports wear', 'single', false, '["运动类","Sports wear","sports_wear"]', '["sports wear","sports_wear"]', '{whole_body,front_view}', '{full_body}', true, 80, '{}'),
  ('yoga_wear', 'sports_wear', 2, '瑜伽服', 'Yoga wear', 'single', false, '["瑜伽服","Yoga wear","yoga_wear","leggings set","sports bra"]', '["yoga wear","yoga_wear"]', '{whole_body,front_view}', '{full_body}', true, 81, '{}'),
  ('volleyball_uniform', 'sports_wear', 2, '排球服', 'Volleyball uniform', 'single', false, '["排球服","Volleyball uniform","volleyball_uniform"]', '["volleyball uniform","volleyball_uniform"]', '{whole_body,front_view}', '{full_body}', true, 82, '{}')
on conflict (code) do update set
  parent_code = excluded.parent_code,
  level = excluded.level,
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  slot = excluded.slot,
  is_intimate = excluded.is_intimate,
  aliases = excluded.aliases,
  recognition_labels = excluded.recognition_labels,
  default_view_tags = excluded.default_view_tags,
  default_crop_tags = excluded.default_crop_tags,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata;
