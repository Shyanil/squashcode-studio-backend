-- SquashCode Creative Studio
-- Enable RLS and create working app policies.
-- Run this in the Supabase SQL editor.
--
-- Why this fixes prompt_sessions insert:
-- The app currently writes through the backend using a local/default user id
-- until real auth is implemented. Authenticated users use auth.uid(); anon/dev
-- requests are restricted to the local app user below.
--
-- The backend uses this same local app user id when no authenticated user is present.

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

grant usage on schema public to anon, authenticated, service_role;
grant execute on function public.squashcode_local_user_id() to anon, authenticated, service_role;
grant execute on function public.squashcode_current_user_id() to anon, authenticated, service_role;

grant select, insert, update, delete on table public.prompt_sessions to anon, authenticated, service_role;
grant select, insert, update, delete on table public.prompt_messages to anon, authenticated, service_role;
grant select, insert, update, delete on table public.prompt_generations to anon, authenticated, service_role;
grant select, insert, update, delete on table public.prompt_assets to anon, authenticated, service_role;
grant select, insert, update, delete on table public.creatives to anon, authenticated, service_role;

alter table public.prompt_sessions enable row level security;
alter table public.prompt_sessions no force row level security;

alter table public.prompt_messages enable row level security;
alter table public.prompt_messages no force row level security;

alter table public.prompt_generations enable row level security;
alter table public.prompt_generations no force row level security;

alter table public.prompt_assets enable row level security;
alter table public.prompt_assets no force row level security;

alter table public.creatives enable row level security;
alter table public.creatives no force row level security;

drop policy if exists prompt_sessions_select_own on public.prompt_sessions;
drop policy if exists prompt_sessions_insert_own on public.prompt_sessions;
drop policy if exists prompt_sessions_update_own on public.prompt_sessions;
drop policy if exists prompt_sessions_delete_own on public.prompt_sessions;

create policy prompt_sessions_select_own
  on public.prompt_sessions
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy prompt_sessions_insert_own
  on public.prompt_sessions
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy prompt_sessions_update_own
  on public.prompt_sessions
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy prompt_sessions_delete_own
  on public.prompt_sessions
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

drop policy if exists prompt_messages_select_own on public.prompt_messages;
drop policy if exists prompt_messages_insert_own on public.prompt_messages;
drop policy if exists prompt_messages_update_own on public.prompt_messages;
drop policy if exists prompt_messages_delete_own on public.prompt_messages;

create policy prompt_messages_select_own
  on public.prompt_messages
  for select
  to anon, authenticated
  using (
    user_id = public.squashcode_current_user_id()
    and exists (
      select 1
      from public.prompt_sessions session
      where session.id = prompt_messages.session_id
        and session.user_id = public.squashcode_current_user_id()
    )
  );

create policy prompt_messages_insert_own
  on public.prompt_messages
  for insert
  to anon, authenticated
  with check (
    user_id = public.squashcode_current_user_id()
    and exists (
      select 1
      from public.prompt_sessions session
      where session.id = prompt_messages.session_id
        and session.user_id = public.squashcode_current_user_id()
    )
  );

create policy prompt_messages_update_own
  on public.prompt_messages
  for update
  to anon, authenticated
  using (
    user_id = public.squashcode_current_user_id()
    and exists (
      select 1
      from public.prompt_sessions session
      where session.id = prompt_messages.session_id
        and session.user_id = public.squashcode_current_user_id()
    )
  )
  with check (
    user_id = public.squashcode_current_user_id()
    and exists (
      select 1
      from public.prompt_sessions session
      where session.id = prompt_messages.session_id
        and session.user_id = public.squashcode_current_user_id()
    )
  );

create policy prompt_messages_delete_own
  on public.prompt_messages
  for delete
  to anon, authenticated
  using (
    user_id = public.squashcode_current_user_id()
    and exists (
      select 1
      from public.prompt_sessions session
      where session.id = prompt_messages.session_id
        and session.user_id = public.squashcode_current_user_id()
    )
  );

drop policy if exists prompt_generations_select_own on public.prompt_generations;
drop policy if exists prompt_generations_insert_own on public.prompt_generations;
drop policy if exists prompt_generations_update_own on public.prompt_generations;
drop policy if exists prompt_generations_delete_own on public.prompt_generations;

create policy prompt_generations_select_own
  on public.prompt_generations
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy prompt_generations_insert_own
  on public.prompt_generations
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy prompt_generations_update_own
  on public.prompt_generations
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy prompt_generations_delete_own
  on public.prompt_generations
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

drop policy if exists prompt_assets_select_own on public.prompt_assets;
drop policy if exists prompt_assets_insert_own on public.prompt_assets;
drop policy if exists prompt_assets_update_own on public.prompt_assets;
drop policy if exists prompt_assets_delete_own on public.prompt_assets;

create policy prompt_assets_select_own
  on public.prompt_assets
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy prompt_assets_insert_own
  on public.prompt_assets
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy prompt_assets_update_own
  on public.prompt_assets
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy prompt_assets_delete_own
  on public.prompt_assets
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

drop policy if exists creatives_select_own on public.creatives;
drop policy if exists creatives_insert_own on public.creatives;
drop policy if exists creatives_update_own on public.creatives;
drop policy if exists creatives_delete_own on public.creatives;

create policy creatives_select_own
  on public.creatives
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy creatives_insert_own
  on public.creatives
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy creatives_update_own
  on public.creatives
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy creatives_delete_own
  on public.creatives
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());
