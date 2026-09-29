-- SquashCode Creative Studio — folders for Generated JSON (Prompt Generator)
-- Run once in Supabase SQL editor. Safe to re-run.

create table if not exists public.prompt_json_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.squashcode_current_user_id(),
  name text not null,
  description text,
  color text not null default 'slate',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompt_json_folders_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists prompt_json_folders_user_name_key
  on public.prompt_json_folders (user_id, lower(btrim(name)));

create index if not exists prompt_json_folders_user_id_idx
  on public.prompt_json_folders (user_id);

drop trigger if exists set_prompt_json_folders_updated_at on public.prompt_json_folders;
create trigger set_prompt_json_folders_updated_at
before update on public.prompt_json_folders
for each row
execute function public.set_updated_at();

alter table public.prompt_generations
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prompt_generations_folder_id_fkey'
      and conrelid = 'public.prompt_generations'::regclass
  ) then
    alter table public.prompt_generations
      add constraint prompt_generations_folder_id_fkey
      foreign key (folder_id)
      references public.prompt_json_folders (id)
      on delete set null;
  end if;
end
$$;

create index if not exists prompt_generations_folder_id_idx
  on public.prompt_generations (folder_id);

grant select, insert, update, delete on table public.prompt_json_folders
  to anon, authenticated, service_role;

alter table public.prompt_json_folders enable row level security;
alter table public.prompt_json_folders no force row level security;

drop policy if exists prompt_json_folders_select_own on public.prompt_json_folders;
create policy prompt_json_folders_select_own
  on public.prompt_json_folders
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

drop policy if exists prompt_json_folders_insert_own on public.prompt_json_folders;
create policy prompt_json_folders_insert_own
  on public.prompt_json_folders
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

drop policy if exists prompt_json_folders_update_own on public.prompt_json_folders;
create policy prompt_json_folders_update_own
  on public.prompt_json_folders
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

drop policy if exists prompt_json_folders_delete_own on public.prompt_json_folders;
create policy prompt_json_folders_delete_own
  on public.prompt_json_folders
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());
