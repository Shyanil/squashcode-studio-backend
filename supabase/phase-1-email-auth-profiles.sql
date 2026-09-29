-- SquashCode Creative Studio
-- Supabase Auth profile sync for email/password users.
--
-- Run this in Supabase SQL editor.
--
-- Important:
-- Email confirmation itself is controlled in Supabase Dashboard:
-- Authentication -> Providers -> Email -> Confirm email = ON
-- Authentication -> URL Configuration -> add your app URL and redirect URLs.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_email_idx
  on public.user_profiles (email);

create or replace function public.squashcode_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.squashcode_set_updated_at();

create or replace function public.squashcode_handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data->>'name', ''), '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(excluded.name, public.user_profiles.name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data
on auth.users
for each row
execute function public.squashcode_handle_auth_user();

insert into public.user_profiles (id, email, name, created_at, updated_at)
select
  id,
  coalesce(email, ''),
  nullif(coalesce(raw_user_meta_data->>'name', ''), ''),
  created_at,
  coalesce(updated_at, created_at)
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  name = coalesce(excluded.name, public.user_profiles.name),
  updated_at = now();

grant select, update on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.user_profiles to service_role;

alter table public.user_profiles enable row level security;
alter table public.user_profiles no force row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_update_own on public.user_profiles;

create policy user_profiles_select_own
  on public.user_profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy user_profiles_update_own
  on public.user_profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
