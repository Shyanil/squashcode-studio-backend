-- SquashCode Creative Studio
-- Creative Generator reference-image + CPanel metadata migration
-- Run this in the Supabase SQL editor.

alter table public.creatives
  add column if not exists cpanel_type text,
  add column if not exists cpanel_subfolder text,
  add column if not exists cpanel_filename text,
  add column if not exists prompt_generation_id uuid,
  add column if not exists reference_image_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.creatives
  drop constraint if exists creatives_cpanel_type_check;

alter table public.creatives
  add constraint creatives_cpanel_type_check
  check (cpanel_type is null or cpanel_type in ('generation', 'reference'));

create index if not exists creatives_prompt_generation_id_idx
  on public.creatives (prompt_generation_id);

create index if not exists creatives_cpanel_subfolder_idx
  on public.creatives (cpanel_type, cpanel_subfolder);

create index if not exists creatives_metadata_gin_idx
  on public.creatives using gin (metadata);

alter table public.prompt_assets
  add column if not exists cpanel_type text,
  add column if not exists cpanel_subfolder text,
  add column if not exists cpanel_filename text;

alter table public.prompt_assets
  drop constraint if exists prompt_assets_cpanel_type_check;

alter table public.prompt_assets
  add constraint prompt_assets_cpanel_type_check
  check (cpanel_type is null or cpanel_type in ('generation', 'reference'));

create index if not exists prompt_assets_cpanel_subfolder_idx
  on public.prompt_assets (cpanel_type, cpanel_subfolder);
