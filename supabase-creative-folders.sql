-- SquashCode Creative Studio
-- Folders for the Image Preview Grid.
-- Run this once in the Supabase SQL editor. It is safe to re-run.
--
-- What this does:
--   1. Creates public.creative_folders.
--   2. Adds creatives.folder_id and links it to the folder table.
--   3. Organises every EXISTING creative into a folder named after its campaign
--      (creatives with no campaign land in "Unsorted"), so nothing stays loose.
--   4. Grants + RLS policies that match the existing app policies.

-- ---------------------------------------------------------------------------
-- 0. Shared helpers (no-ops if the earlier scripts already created them)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.squashcode_local_user_id()
returns uuid
language sql
stable
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function public.squashcode_current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(auth.uid(), public.squashcode_local_user_id());
$$;

-- ---------------------------------------------------------------------------
-- 1. Folder table
-- ---------------------------------------------------------------------------

create table if not exists public.creative_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.squashcode_current_user_id(),
  name text not null,
  description text,
  color text not null default 'slate',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_folders_name_not_blank check (btrim(name) <> '')
);

-- One folder name per user, case-insensitive.
create unique index if not exists creative_folders_user_name_key
  on public.creative_folders (user_id, lower(btrim(name)));

create index if not exists creative_folders_user_id_idx
  on public.creative_folders (user_id);

drop trigger if exists set_creative_folders_updated_at on public.creative_folders;
create trigger set_creative_folders_updated_at
before update on public.creative_folders
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Link creatives to a folder
-- ---------------------------------------------------------------------------

alter table public.creatives
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creatives_folder_id_fkey'
      and conrelid = 'public.creatives'::regclass
  ) then
    alter table public.creatives
      add constraint creatives_folder_id_fkey
      foreign key (folder_id)
      references public.creative_folders (id)
      on delete set null;
  end if;
end
$$;

create index if not exists creatives_folder_id_idx
  on public.creatives (folder_id);

-- ---------------------------------------------------------------------------
-- 3. Organise the images that already exist
-- ---------------------------------------------------------------------------

-- 3a. One folder per (user, campaign). Blank campaigns become "Unsorted".
insert into public.creative_folders (user_id, name, description)
select distinct
  existing.user_id,
  coalesce(nullif(btrim(existing.campaign), ''), 'Unsorted') as name,
  'Created automatically from existing creatives.' as description
from public.creatives existing
where existing.folder_id is null
on conflict do nothing;

-- 3b. Drop every unfiled creative into its matching folder.
update public.creatives target
set folder_id = folder.id
from public.creative_folders folder
where target.folder_id is null
  and folder.user_id = target.user_id
  and lower(btrim(folder.name)) = lower(coalesce(nullif(btrim(target.campaign), ''), 'Unsorted'));

-- ---------------------------------------------------------------------------
-- 4. Grants + RLS (same shape as enable-rls-app-policies.sql)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.creative_folders
  to anon, authenticated, service_role;

alter table public.creative_folders enable row level security;
alter table public.creative_folders no force row level security;

drop policy if exists creative_folders_select_own on public.creative_folders;
drop policy if exists creative_folders_insert_own on public.creative_folders;
drop policy if exists creative_folders_update_own on public.creative_folders;
drop policy if exists creative_folders_delete_own on public.creative_folders;

create policy creative_folders_select_own
  on public.creative_folders
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy creative_folders_insert_own
  on public.creative_folders
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy creative_folders_update_own
  on public.creative_folders
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy creative_folders_delete_own
  on public.creative_folders
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

-- ---------------------------------------------------------------------------
-- 5. Check the result
-- ---------------------------------------------------------------------------

select
  folder.name          as folder,
  folder.user_id,
  count(creative.id)   as images
from public.creative_folders folder
left join public.creatives creative on creative.folder_id = folder.id
group by folder.name, folder.user_id
order by images desc, folder.name;
