-- SquashCode Creative Studio
-- Manual JSON / Creative name fields
-- Run this in the Supabase SQL editor after the base prompt + creative schema exists.
--
-- The app still writes the existing title fields for compatibility.
-- These columns make user-supplied names explicit and searchable in Supabase:
--   prompt_sessions.manual_name / display_name
--   prompt_generations.manual_name / display_name
--   creatives.manual_name / display_name

create or replace function public.squashcode_compact_display_name(
  raw_value text,
  fallback_value text default 'Campaign Creative'
)
returns text
language plpgsql
stable
as $$
declare
  cleaned text;
  word_count integer;
begin
  cleaned := coalesce(raw_value, '');
  cleaned := regexp_replace(cleaned, '[_/]+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '^\s*option\s+[0-9]+\s*:\s*', '', 'i');
  cleaned := regexp_replace(cleaned, '^\s*(revision|variation)\s*:\s*', '', 'i');
  cleaned := regexp_replace(
    cleaned,
    '^\s*(please|kindly|can you|could you|i need|i want|create|generate|make|use)\s+',
    '',
    'i'
  );
  cleaned := regexp_replace(cleaned, '\s+(please|okay|ok)\s*$', '', 'i');
  cleaned := regexp_replace(btrim(cleaned), '[\s\.,!?:;"'']+$', '', 'g');

  if cleaned = '' then
    return fallback_value;
  end if;

  if lower(cleaned) in (
    'campaign creative',
    'creative',
    'creative from json',
    'json prompt draft',
    'json prompt generator session',
    'new visual concept',
    'prompt',
    'untitled prompt'
  ) or cleaned ~* '^creative from json(\s+v[0-9]+)?$'
    or cleaned ~* '^json\s+v[0-9]+$' then
    return fallback_value;
  end if;

  word_count := array_length(regexp_split_to_array(cleaned, '\s+'), 1);

  if word_count > 8 then
    return fallback_value;
  end if;

  cleaned := initcap(cleaned);

  if length(cleaned) > 42 then
    cleaned := left(cleaned, 39) || '...';
  end if;

  return cleaned;
end;
$$;

create or replace function public.squashcode_prompt_display_name(
  generated_json jsonb,
  prompt_metadata jsonb,
  creative_context jsonb,
  image_analysis jsonb,
  session_title text default null
)
returns text
language plpgsql
stable
as $$
declare
  manual_title text;
  existing_title text;
  campaign_type text;
  industry text;
  subject text;
  candidate text;
begin
  manual_title := public.squashcode_compact_display_name(session_title, '');

  if manual_title <> '' then
    return manual_title;
  end if;

  existing_title := public.squashcode_compact_display_name(
    coalesce(prompt_metadata->>'displayTitle', generated_json->>'title'),
    ''
  );

  if existing_title <> '' then
    return existing_title;
  end if;

  campaign_type := coalesce(
    generated_json#>>'{campaign,type}',
    creative_context->>'campaignType',
    image_analysis->>'campaignType'
  );
  campaign_type := regexp_replace(coalesce(campaign_type, ''), '\b(campaign|creative|prompt)\b', '', 'ig');

  industry := coalesce(
    generated_json#>>'{campaign,industry}',
    creative_context->>'industry',
    image_analysis->>'industry'
  );

  subject := coalesce(
    generated_json#>>'{visualDirection,subject}',
    creative_context->>'subject',
    image_analysis->>'subject'
  );

  if public.squashcode_compact_display_name(campaign_type, '') <> '' then
    if public.squashcode_compact_display_name(industry, '') <> ''
      and position(lower(industry) in lower(campaign_type)) = 0 then
      candidate := industry || ' ' || campaign_type;
    else
      candidate := campaign_type;
    end if;

    return public.squashcode_compact_display_name(candidate, 'Campaign Creative');
  end if;

  if public.squashcode_compact_display_name(subject, '') <> '' then
    return public.squashcode_compact_display_name(subject, 'Campaign Creative');
  end if;

  return 'Campaign Creative';
end;
$$;

alter table public.prompt_sessions
  add column if not exists manual_name text,
  add column if not exists display_name text;

alter table public.prompt_generations
  add column if not exists manual_name text,
  add column if not exists display_name text;

alter table public.creatives
  add column if not exists manual_name text,
  add column if not exists display_name text;

create index if not exists prompt_sessions_user_id_display_name_idx
  on public.prompt_sessions (user_id, display_name);

create index if not exists prompt_generations_user_id_display_name_idx
  on public.prompt_generations (user_id, display_name);

create index if not exists creatives_user_id_display_name_idx
  on public.creatives (user_id, display_name);

with generation_names as (
  select
    id,
    nullif(
      public.squashcode_compact_display_name(
        coalesce(prompt_metadata->>'manualTitle', manual_name),
        ''
      ),
      ''
    ) as manual_title,
    public.squashcode_prompt_display_name(
      generated_json,
      prompt_metadata,
      creative_context_snapshot,
      image_insights,
      coalesce(prompt_metadata->>'manualTitle', manual_name)
    ) as display_title
  from public.prompt_generations
)
update public.prompt_generations generation
set
  manual_name = generation_names.manual_title,
  display_name = generation_names.display_title,
  generated_json = jsonb_set(
    coalesce(generation.generated_json, '{}'::jsonb),
    '{title}',
    to_jsonb(generation_names.display_title),
    true
  ),
  prompt_metadata = case
    when generation_names.manual_title is null then jsonb_set(
      coalesce(generation.prompt_metadata, '{}'::jsonb),
      '{displayTitle}',
      to_jsonb(generation_names.display_title),
      true
    )
    else jsonb_set(
      jsonb_set(
        coalesce(generation.prompt_metadata, '{}'::jsonb),
        '{displayTitle}',
        to_jsonb(generation_names.display_title),
        true
      ),
      '{manualTitle}',
      to_jsonb(generation_names.manual_title),
      true
    )
  end
from generation_names
where generation.id = generation_names.id;

with latest_generation as (
  select distinct on (session_id)
    session_id,
    generated_json,
    prompt_metadata,
    creative_context_snapshot,
    image_insights
  from public.prompt_generations
  order by session_id, created_at desc
),
session_names as (
  select
    session.id,
    nullif(
      public.squashcode_compact_display_name(
        coalesce(session.metadata->>'manualTitle', session.manual_name, session.title),
        ''
      ),
      ''
    ) as manual_title,
    public.squashcode_prompt_display_name(
      coalesce(latest_generation.generated_json, '{}'::jsonb),
      coalesce(latest_generation.prompt_metadata, '{}'::jsonb),
      coalesce(session.creative_context, latest_generation.creative_context_snapshot, '{}'::jsonb),
      coalesce(session.image_analysis, latest_generation.image_insights, '{}'::jsonb),
      coalesce(session.metadata->>'manualTitle', session.manual_name, session.title)
    ) as display_title
  from public.prompt_sessions session
  left join latest_generation on latest_generation.session_id = session.id
)
update public.prompt_sessions session
set
  title = session_names.display_title,
  manual_name = session_names.manual_title,
  display_name = session_names.display_title,
  metadata = case
    when session_names.manual_title is null then jsonb_set(
      coalesce(session.metadata, '{}'::jsonb),
      '{displayTitle}',
      to_jsonb(session_names.display_title),
      true
    )
    else jsonb_set(
      jsonb_set(
        coalesce(session.metadata, '{}'::jsonb),
        '{displayTitle}',
        to_jsonb(session_names.display_title),
        true
      ),
      '{manualTitle}',
      to_jsonb(session_names.manual_title),
      true
    )
  end
from session_names
where session.id = session_names.id;

with creative_names as (
  select
    creative.id,
    nullif(
      public.squashcode_compact_display_name(
        coalesce(creative.metadata->>'manualTitle', creative.manual_name, creative.title),
        ''
      ),
      ''
    ) as manual_title,
    case
      when creative.title ~* '^\s*revision\s*:'
        then public.squashcode_compact_display_name(
          'Revision - ' || coalesce(
            prompt.display_name,
            prompt.prompt_metadata->>'displayTitle',
            public.squashcode_prompt_display_name(
              prompt.generated_json,
              prompt.prompt_metadata,
              prompt.creative_context_snapshot,
              prompt.image_insights,
              null
            ),
            'Creative'
          ),
          'Revision'
        )
      when creative.title ~* '^\s*variation\s*:'
        then public.squashcode_compact_display_name(
          'Variation - ' || coalesce(
            prompt.display_name,
            prompt.prompt_metadata->>'displayTitle',
            public.squashcode_prompt_display_name(
              prompt.generated_json,
              prompt.prompt_metadata,
              prompt.creative_context_snapshot,
              prompt.image_insights,
              null
            ),
            'Creative'
          ),
          'Variation'
        )
      when public.squashcode_compact_display_name(creative.title, '') = ''
        then coalesce(
          prompt.display_name,
          prompt.prompt_metadata->>'displayTitle',
          public.squashcode_prompt_display_name(
            prompt.generated_json,
            prompt.prompt_metadata,
            prompt.creative_context_snapshot,
            prompt.image_insights,
            null
          ),
          'Campaign Creative'
        )
      else public.squashcode_compact_display_name(creative.title, 'Campaign Creative')
    end as display_title
  from public.creatives creative
  left join public.prompt_generations prompt on prompt.id = creative.prompt_generation_id
)
update public.creatives creative
set
  title = creative_names.display_title,
  manual_name = creative_names.manual_title,
  display_name = creative_names.display_title,
  metadata = case
    when creative_names.manual_title is null then jsonb_set(
      coalesce(creative.metadata, '{}'::jsonb),
      '{displayTitle}',
      to_jsonb(creative_names.display_title),
      true
    )
    else jsonb_set(
      jsonb_set(
        coalesce(creative.metadata, '{}'::jsonb),
        '{displayTitle}',
        to_jsonb(creative_names.display_title),
        true
      ),
      '{manualTitle}',
      to_jsonb(creative_names.manual_title),
      true
    )
  end
from creative_names
where creative.id = creative_names.id;

create or replace function public.squashcode_sync_name_fields()
returns trigger
language plpgsql
as $$
declare
  manual_title text;
  display_title text;
begin
  if TG_TABLE_NAME = 'prompt_sessions' then
    manual_title := nullif(
      public.squashcode_compact_display_name(
        coalesce(new.metadata->>'manualTitle', new.manual_name, new.title),
        ''
      ),
      ''
    );
    display_title := public.squashcode_prompt_display_name(
      '{}'::jsonb,
      coalesce(new.metadata, '{}'::jsonb),
      coalesce(new.creative_context, '{}'::jsonb),
      coalesce(new.image_analysis, '{}'::jsonb),
      manual_title
    );
    new.manual_name := manual_title;
    new.display_name := display_title;
    new.title := display_title;
    new.metadata := jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      '{displayTitle}',
      to_jsonb(display_title),
      true
    );

    if manual_title is not null then
      new.metadata := jsonb_set(new.metadata, '{manualTitle}', to_jsonb(manual_title), true);
    end if;
  elsif TG_TABLE_NAME = 'prompt_generations' then
    manual_title := nullif(
      public.squashcode_compact_display_name(
        coalesce(new.prompt_metadata->>'manualTitle', new.manual_name),
        ''
      ),
      ''
    );
    display_title := public.squashcode_prompt_display_name(
      coalesce(new.generated_json, '{}'::jsonb),
      coalesce(new.prompt_metadata, '{}'::jsonb),
      coalesce(new.creative_context_snapshot, '{}'::jsonb),
      coalesce(new.image_insights, '{}'::jsonb),
      manual_title
    );
    new.manual_name := manual_title;
    new.display_name := display_title;
    new.generated_json := jsonb_set(
      coalesce(new.generated_json, '{}'::jsonb),
      '{title}',
      to_jsonb(display_title),
      true
    );
    new.prompt_metadata := jsonb_set(
      coalesce(new.prompt_metadata, '{}'::jsonb),
      '{displayTitle}',
      to_jsonb(display_title),
      true
    );

    if manual_title is not null then
      new.prompt_metadata := jsonb_set(new.prompt_metadata, '{manualTitle}', to_jsonb(manual_title), true);
    end if;
  elsif TG_TABLE_NAME = 'creatives' then
    manual_title := nullif(
      public.squashcode_compact_display_name(
        coalesce(new.metadata->>'manualTitle', new.manual_name, new.title),
        ''
      ),
      ''
    );
    display_title := public.squashcode_compact_display_name(
      coalesce(new.metadata->>'displayTitle', manual_title, new.display_name, new.title),
      'Campaign Creative'
    );
    new.manual_name := manual_title;
    new.display_name := display_title;
    new.title := display_title;
    new.metadata := jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      '{displayTitle}',
      to_jsonb(display_title),
      true
    );

    if manual_title is not null then
      new.metadata := jsonb_set(new.metadata, '{manualTitle}', to_jsonb(manual_title), true);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_prompt_sessions_name_fields on public.prompt_sessions;
create trigger sync_prompt_sessions_name_fields
before insert or update
on public.prompt_sessions
for each row
execute function public.squashcode_sync_name_fields();

drop trigger if exists sync_prompt_generations_name_fields on public.prompt_generations;
create trigger sync_prompt_generations_name_fields
before insert or update
on public.prompt_generations
for each row
execute function public.squashcode_sync_name_fields();

drop trigger if exists sync_creatives_name_fields on public.creatives;
create trigger sync_creatives_name_fields
before insert or update
on public.creatives
for each row
execute function public.squashcode_sync_name_fields();
