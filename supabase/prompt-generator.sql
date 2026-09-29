-- SquashCode Creative Studio
-- Prompt Generator schema only
-- Run this file in Supabase SQL editor.
--
-- What this sets up:
-- 1. Prompt sessions for the chat-style generator
-- 2. Prompt messages for conversation history
-- 3. Prompt generations for structured JSON output
-- 4. Prompt assets for uploaded reference files
-- 5. RLS policies for authenticated users
-- 6. A private Supabase Storage bucket for prompt uploads

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.prompt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled prompt',
  source_type text not null default 'mixed'
    check (source_type in ('text', 'image', 'mixed')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'generated', 'archived')),
  brand_context jsonb not null default '{}'::jsonb,
  creative_context jsonb not null default '{}'::jsonb,
  image_analysis jsonb not null default '{}'::jsonb,
  memory_context jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_generated_at timestamptz
);

create table if not exists public.prompt_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.prompt_sessions(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  content_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_generations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.prompt_sessions(id) on delete cascade,
  user_id uuid not null,
  version_number integer not null default 1,
  prompt_text text not null default '',
  generated_json jsonb not null default '{}'::jsonb,
  prompt_metadata jsonb not null default '{}'::jsonb,
  image_insights jsonb not null default '{}'::jsonb,
  creative_context_snapshot jsonb not null default '{}'::jsonb,
  conversation_snapshot jsonb not null default '[]'::jsonb,
  reference_image_path text,
  reference_image_url text,
  model_name text,
  aspect_ratio text not null default '1:1',
  quality text not null default 'high',
  image_count integer not null default 1 check (image_count between 1 and 8),
  status text not null default 'completed'
    check (status in ('queued', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.prompt_sessions(id) on delete cascade,
  user_id uuid not null,
  bucket_name text not null default 'prompt-generator-assets',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  reference_image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_name, storage_path)
);

alter table public.prompt_sessions
  drop constraint if exists prompt_sessions_user_id_fkey;

alter table public.prompt_messages
  drop constraint if exists prompt_messages_user_id_fkey;

alter table public.prompt_generations
  drop constraint if exists prompt_generations_user_id_fkey;

alter table public.prompt_assets
  drop constraint if exists prompt_assets_user_id_fkey;

alter table public.prompt_sessions
  add column if not exists creative_context jsonb not null default '{}'::jsonb,
  add column if not exists image_analysis jsonb not null default '{}'::jsonb,
  add column if not exists memory_context jsonb not null default '[]'::jsonb;

alter table public.prompt_generations
  add column if not exists version_number integer not null default 1,
  add column if not exists image_insights jsonb not null default '{}'::jsonb,
  add column if not exists creative_context_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists conversation_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists reference_image_path text,
  add column if not exists reference_image_url text;

alter table public.prompt_assets
  add column if not exists reference_image_url text;

create index if not exists prompt_sessions_user_id_created_at_idx
  on public.prompt_sessions (user_id, created_at desc);

create index if not exists prompt_sessions_user_id_updated_at_idx
  on public.prompt_sessions (user_id, updated_at desc);

create index if not exists prompt_sessions_creative_context_gin_idx
  on public.prompt_sessions using gin (creative_context);

create index if not exists prompt_messages_session_id_created_at_idx
  on public.prompt_messages (session_id, created_at asc);

create index if not exists prompt_messages_user_id_created_at_idx
  on public.prompt_messages (user_id, created_at desc);

create index if not exists prompt_generations_session_id_created_at_idx
  on public.prompt_generations (session_id, created_at desc);

create index if not exists prompt_generations_user_id_created_at_idx
  on public.prompt_generations (user_id, created_at desc);

create index if not exists prompt_assets_session_id_created_at_idx
  on public.prompt_assets (session_id, created_at desc);

create index if not exists prompt_assets_user_id_created_at_idx
  on public.prompt_assets (user_id, created_at desc);

create index if not exists prompt_generations_generated_json_gin_idx
  on public.prompt_generations using gin (generated_json);

create index if not exists prompt_generations_context_snapshot_gin_idx
  on public.prompt_generations using gin (creative_context_snapshot);

create unique index if not exists prompt_generations_session_version_idx
  on public.prompt_generations (session_id, version_number);

drop trigger if exists set_prompt_sessions_updated_at on public.prompt_sessions;
create trigger set_prompt_sessions_updated_at
before update on public.prompt_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_prompt_generations_updated_at on public.prompt_generations;
create trigger set_prompt_generations_updated_at
before update on public.prompt_generations
for each row
execute function public.set_updated_at();

drop trigger if exists set_prompt_assets_updated_at on public.prompt_assets;
create trigger set_prompt_assets_updated_at
before update on public.prompt_assets
for each row
execute function public.set_updated_at();

alter table public.prompt_sessions disable row level security;
alter table public.prompt_messages disable row level security;
alter table public.prompt_generations disable row level security;
alter table public.prompt_assets disable row level security;

drop policy if exists prompt_sessions_select_own on public.prompt_sessions;
create policy prompt_sessions_select_own
  on public.prompt_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists prompt_sessions_insert_own on public.prompt_sessions;
create policy prompt_sessions_insert_own
  on public.prompt_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists prompt_sessions_update_own on public.prompt_sessions;
create policy prompt_sessions_update_own
  on public.prompt_sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists prompt_sessions_delete_own on public.prompt_sessions;
create policy prompt_sessions_delete_own
  on public.prompt_sessions
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists prompt_messages_select_own on public.prompt_messages;
create policy prompt_messages_select_own
  on public.prompt_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.prompt_sessions s
      where s.id = prompt_messages.session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists prompt_messages_insert_own on public.prompt_messages;
create policy prompt_messages_insert_own
  on public.prompt_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.prompt_sessions s
      where s.id = prompt_messages.session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists prompt_messages_update_own on public.prompt_messages;
create policy prompt_messages_update_own
  on public.prompt_messages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.prompt_sessions s
      where s.id = prompt_messages.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.prompt_sessions s
      where s.id = prompt_messages.session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists prompt_messages_delete_own on public.prompt_messages;
create policy prompt_messages_delete_own
  on public.prompt_messages
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.prompt_sessions s
      where s.id = prompt_messages.session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists prompt_generations_select_own on public.prompt_generations;
create policy prompt_generations_select_own
  on public.prompt_generations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists prompt_generations_insert_own on public.prompt_generations;
create policy prompt_generations_insert_own
  on public.prompt_generations
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists prompt_generations_update_own on public.prompt_generations;
create policy prompt_generations_update_own
  on public.prompt_generations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists prompt_generations_delete_own on public.prompt_generations;
create policy prompt_generations_delete_own
  on public.prompt_generations
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists prompt_assets_select_own on public.prompt_assets;
create policy prompt_assets_select_own
  on public.prompt_assets
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists prompt_assets_insert_own on public.prompt_assets;
create policy prompt_assets_insert_own
  on public.prompt_assets
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists prompt_assets_update_own on public.prompt_assets;
create policy prompt_assets_update_own
  on public.prompt_assets
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists prompt_assets_delete_own on public.prompt_assets;
create policy prompt_assets_delete_own
  on public.prompt_assets
  for delete
  to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('prompt-generator-assets', 'prompt-generator-assets', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists prompt_assets_storage_select_own on storage.objects;
create policy prompt_assets_storage_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'prompt-generator-assets'
    and owner = auth.uid()
  );

drop policy if exists prompt_assets_storage_insert_own on storage.objects;
create policy prompt_assets_storage_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'prompt-generator-assets'
    and owner = auth.uid()
  );

drop policy if exists prompt_assets_storage_update_own on storage.objects;
create policy prompt_assets_storage_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'prompt-generator-assets'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'prompt-generator-assets'
    and owner = auth.uid()
  );

drop policy if exists prompt_assets_storage_delete_own on storage.objects;
create policy prompt_assets_storage_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'prompt-generator-assets'
    and owner = auth.uid()
  );
