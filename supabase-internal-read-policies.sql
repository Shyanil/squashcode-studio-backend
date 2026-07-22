-- SquashCode Creative Studio internal read policies
--
-- Run this in the Supabase SQL editor.
-- This keeps RLS enabled. It only allows signed-in team users to read shared
-- internal creative data; existing owner-scoped insert/update/delete policies
-- continue to protect writes.

alter table public.prompt_sessions enable row level security;
alter table public.prompt_messages enable row level security;
alter table public.prompt_generations enable row level security;
alter table public.prompt_assets enable row level security;
alter table public.creatives enable row level security;

grant select on table public.prompt_sessions to authenticated;
grant select on table public.prompt_messages to authenticated;
grant select on table public.prompt_generations to authenticated;
grant select on table public.prompt_assets to authenticated;
grant select on table public.creatives to authenticated;

drop policy if exists prompt_sessions_select_internal_team on public.prompt_sessions;
create policy prompt_sessions_select_internal_team
  on public.prompt_sessions
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists prompt_messages_select_internal_team on public.prompt_messages;
create policy prompt_messages_select_internal_team
  on public.prompt_messages
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists prompt_generations_select_internal_team on public.prompt_generations;
create policy prompt_generations_select_internal_team
  on public.prompt_generations
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists prompt_assets_select_internal_team on public.prompt_assets;
create policy prompt_assets_select_internal_team
  on public.prompt_assets
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists creatives_select_internal_team on public.creatives;
create policy creatives_select_internal_team
  on public.creatives
  for select
  to authenticated
  using (auth.uid() is not null);
