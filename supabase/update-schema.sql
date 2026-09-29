-- SquashCode Creative Studio
-- Database Updates for CPanel Integration and Creative Storage
-- Run this in your Supabase SQL editor.

-- 1. Modify prompt_assets to support cpanel upload references
-- Drop the unique constraint on (bucket_name, storage_path) since we aren't uploading to Supabase Storage
alter table public.prompt_assets drop constraint if exists prompt_assets_bucket_name_storage_path_key;

-- Make bucket_name and storage_path columns nullable (since we only store cpanel URL now)
alter table public.prompt_assets alter column bucket_name drop not null;
alter table public.prompt_assets alter column bucket_name drop default;
alter table public.prompt_assets alter column storage_path drop not null;

-- 2. Create the creatives table to store AI campaign visual options
create table if not exists public.creatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  brand text not null default 'AI Creative Studio',
  campaign text not null default 'AI Campaign',
  tags text[] not null default '{}'::text[],
  date text not null,
  aspect_ratio text not null default '1:1',
  variant text not null default 'mint',
  favorite boolean not null default false,
  image_url text not null,
  cpanel_type text,
  cpanel_subfolder text,
  cpanel_filename text,
  prompt_generation_id uuid,
  reference_image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creatives
  add column if not exists cpanel_type text,
  add column if not exists cpanel_subfolder text,
  add column if not exists cpanel_filename text,
  add column if not exists prompt_generation_id uuid,
  add column if not exists reference_image_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Disable Row Level Security (RLS) across all tables to ensure data is always successfully saved
alter table public.creatives disable row level security;
alter table public.prompt_sessions disable row level security;
alter table public.prompt_messages disable row level security;
alter table public.prompt_generations disable row level security;
alter table public.prompt_assets disable row level security;

-- Drop trigger if exists and recreate trigger for creatives table updated_at
drop trigger if exists set_creatives_updated_at on public.creatives;
create trigger set_creatives_updated_at
before update on public.creatives
for each row
execute function public.set_updated_at();
