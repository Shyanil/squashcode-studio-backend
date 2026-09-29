-- SquashCode Creative Studio
-- Cleanup existing bad JSON / creative display names.
-- Run this in the Supabase SQL editor after the prompt/creative tables exist.

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
    'creative',
    'creative from json',
    'json prompt draft',
    'json prompt generator session',
    'new visual concept',
    'prompt',
    'untitled prompt'
  ) then
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
  existing_title text;
  campaign_type text;
  industry text;
  subject text;
  candidate text;
begin
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

  return public.squashcode_compact_display_name(session_title, 'Campaign Creative');
end;
$$;

with generation_names as (
  select
    id,
    public.squashcode_prompt_display_name(
      generated_json,
      prompt_metadata,
      creative_context_snapshot,
      image_insights,
      null
    ) as display_title
  from public.prompt_generations
)
update public.prompt_generations generation
set
  generated_json = jsonb_set(
    coalesce(generation.generated_json, '{}'::jsonb),
    '{title}',
    to_jsonb(generation_names.display_title),
    true
  ),
  prompt_metadata = jsonb_set(
    coalesce(generation.prompt_metadata, '{}'::jsonb),
    '{displayTitle}',
    to_jsonb(generation_names.display_title),
    true
  )
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
    public.squashcode_prompt_display_name(
      coalesce(latest_generation.generated_json, '{}'::jsonb),
      coalesce(latest_generation.prompt_metadata, '{}'::jsonb),
      coalesce(session.creative_context, latest_generation.creative_context_snapshot, '{}'::jsonb),
      coalesce(session.image_analysis, latest_generation.image_insights, '{}'::jsonb),
      session.title
    ) as display_title
  from public.prompt_sessions session
  left join latest_generation on latest_generation.session_id = session.id
)
update public.prompt_sessions session
set
  title = session_names.display_title,
  metadata = jsonb_set(
    coalesce(session.metadata, '{}'::jsonb),
    '{displayTitle}',
    to_jsonb(session_names.display_title),
    true
  )
from session_names
where session.id = session_names.id;

with creative_names as (
  select
    creative.id,
    case
      when creative.title ~* '^\s*revision\s*:'
        then public.squashcode_compact_display_name(
          'Revision - ' || coalesce(
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
  metadata = jsonb_set(
    coalesce(creative.metadata, '{}'::jsonb),
    '{displayTitle}',
    to_jsonb(creative_names.display_title),
    true
  )
from creative_names
where creative.id = creative_names.id;
