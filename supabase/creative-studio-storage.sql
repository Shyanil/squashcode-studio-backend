-- =============================================================================
-- SquashCode Creative Studio — STORAGE SETUP (run this file)
-- =============================================================================
-- Where: Supabase Dashboard → SQL → New query → paste → Run
--
-- This is the only SQL file required for image storage (Creative Generator +
-- Prompt Generator uploads). It creates the bucket, policies, and placeholder
-- folders under `creative-studio-assets`.
--
-- Other SQL files (run separately, only if you have not already):
--   • supabase/prompt-generator.sql        — prompt_sessions, prompt_assets, etc.
--   • supabase/update-schema.sql           — creatives table extensions
--   • supabase/enable-rls-app-policies.sql — app RLS (if used)
--
-- Prompt Generator storage paths (same bucket):
--   references/primary/{userId}/{sessionId}/{timestamp}-{fileName}
--   references/supporting/{userId}/{sessionId}/{timestamp}-{fileName}
--
-- Creative Generator storage paths:
--   generations/{userId}/{folderId}/{creativeId}/{fileName}
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-studio-assets',
  'creative-studio-assets',
  true,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 2. Path ownership helper (generations/*, references/*, uploads/*, previews/*)
-- -----------------------------------------------------------------------------
create or replace function public.creative_studio_user_owns_storage_path(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    case (storage.foldername(object_name))[1]
      when 'generations' then (storage.foldername(object_name))[2] = auth.uid()::text
      when 'references' then (storage.foldername(object_name))[3] = auth.uid()::text
      when 'uploads' then (storage.foldername(object_name))[3] = auth.uid()::text
      when 'previews' then (storage.foldername(object_name))[3] = auth.uid()::text
      else (storage.foldername(object_name))[1] = auth.uid()::text
        or (storage.foldername(object_name))[2] = auth.uid()::text
    end,
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Storage policies
-- -----------------------------------------------------------------------------
drop policy if exists creative_studio_assets_public_read on storage.objects;
create policy creative_studio_assets_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'creative-studio-assets');

drop policy if exists creative_studio_assets_insert_own on storage.objects;
create policy creative_studio_assets_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'creative-studio-assets'
    and public.creative_studio_user_owns_storage_path(name)
  );

drop policy if exists creative_studio_assets_update_own on storage.objects;
create policy creative_studio_assets_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'creative-studio-assets'
    and public.creative_studio_user_owns_storage_path(name)
  )
  with check (
    bucket_id = 'creative-studio-assets'
    and public.creative_studio_user_owns_storage_path(name)
  );

drop policy if exists creative_studio_assets_delete_own on storage.objects;
create policy creative_studio_assets_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'creative-studio-assets'
    and public.creative_studio_user_owns_storage_path(name)
  );

-- -----------------------------------------------------------------------------
-- 4. Folder placeholders (visible in Storage UI; real files use same prefixes)
--    Prompt Generator → references/primary, references/supporting
-- -----------------------------------------------------------------------------
create or replace function public.ensure_creative_studio_storage_folders()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  bucket constant text := 'creative-studio-assets';
  folder_path text;
  placeholder_name text;
  folder_paths text[] := array[
    'references/primary',
    'references/supporting',
    'generations',
    'uploads/manual',
    'previews/thumbnails'
  ];
begin
  foreach folder_path in array folder_paths
  loop
    placeholder_name := folder_path || '/.keep';

    if not exists (
      select 1
      from storage.objects
      where bucket_id = bucket
        and name = placeholder_name
    ) then
      insert into storage.objects (id, bucket_id, name, owner, metadata)
      values (
        gen_random_uuid(),
        bucket,
        placeholder_name,
        '00000000-0000-0000-0000-000000000000'::uuid,
        jsonb_build_object(
          'purpose', 'folder-placeholder',
          'app', case
            when folder_path like 'references/%' then 'prompt-generator'
            when folder_path = 'generations' then 'creative-generator'
            else 'creative-studio'
          end
        )
      );
    end if;
  end loop;
end;
$$;

select public.ensure_creative_studio_storage_folders();

-- Optional: drop the helper if you prefer not to keep the definer function callable
-- revoke all on function public.ensure_creative_studio_storage_folders() from public;
