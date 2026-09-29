-- SquashCode Creative Studio
-- Phase 1: Feedback capture and campaign metrics
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.creative_feedback (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references public.creatives(id) on delete cascade,
  prompt_generation_id uuid references public.prompt_generations(id) on delete set null,
  user_id uuid not null,
  signal_type text not null
    check (
      signal_type in (
        'favorite',
        'unfavorite',
        'like',
        'dislike',
        'approved',
        'rejected',
        'revision_requested',
        'exported',
        'deleted',
        'manual_note'
      )
    ),
  score numeric not null default 0,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_feedback_creative_id_created_at_idx
  on public.creative_feedback (creative_id, created_at desc);

create index if not exists creative_feedback_user_id_created_at_idx
  on public.creative_feedback (user_id, created_at desc);

create table if not exists public.creative_metrics (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references public.creatives(id) on delete cascade,
  user_id uuid not null,
  platform text,
  campaign_name text,
  impressions integer,
  reach integer,
  clicks integer,
  conversions integer,
  spend numeric,
  revenue numeric,
  ctr numeric,
  conversion_rate numeric,
  raw_metrics jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists creative_metrics_creative_id_captured_at_idx
  on public.creative_metrics (creative_id, captured_at desc);

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

grant select, insert, update, delete on table public.creative_feedback to anon, authenticated, service_role;
grant select, insert, update, delete on table public.creative_metrics to anon, authenticated, service_role;

alter table public.creative_feedback enable row level security;
alter table public.creative_feedback no force row level security;

alter table public.creative_metrics enable row level security;
alter table public.creative_metrics no force row level security;

drop policy if exists creative_feedback_select_own on public.creative_feedback;
drop policy if exists creative_feedback_insert_own on public.creative_feedback;
drop policy if exists creative_feedback_update_own on public.creative_feedback;
drop policy if exists creative_feedback_delete_own on public.creative_feedback;

create policy creative_feedback_select_own
  on public.creative_feedback
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy creative_feedback_insert_own
  on public.creative_feedback
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy creative_feedback_update_own
  on public.creative_feedback
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy creative_feedback_delete_own
  on public.creative_feedback
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

drop policy if exists creative_metrics_select_own on public.creative_metrics;
drop policy if exists creative_metrics_insert_own on public.creative_metrics;
drop policy if exists creative_metrics_update_own on public.creative_metrics;
drop policy if exists creative_metrics_delete_own on public.creative_metrics;

create policy creative_metrics_select_own
  on public.creative_metrics
  for select
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());

create policy creative_metrics_insert_own
  on public.creative_metrics
  for insert
  to anon, authenticated
  with check (user_id = public.squashcode_current_user_id());

create policy creative_metrics_update_own
  on public.creative_metrics
  for update
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id())
  with check (user_id = public.squashcode_current_user_id());

create policy creative_metrics_delete_own
  on public.creative_metrics
  for delete
  to anon, authenticated
  using (user_id = public.squashcode_current_user_id());
