import type { CreativeContext, ImageAnalysis, JsonObject } from '@/models/prompt.model';

type DisplayRecord = Record<string, unknown>;

const maxDisplayNameLength = 42;
const genericNames = new Set([
  'creative',
  'creative from json',
  'campaign creative',
  'json prompt draft',
  'json prompt generator session',
  'new visual concept',
  'previous generated prompt',
  'prompt',
  'saved json',
  'untitled prompt',
]);

function asRecord(value: unknown): DisplayRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as DisplayRecord)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function titleCase(value: string) {
  return value
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part.length <= 2 && part === part.toUpperCase()
            ? part
            : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
        )
        .join('-'),
    )
    .join(' ');
}

function trimToLength(value: string, maxLength = maxDisplayNameLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function stripNoise(value: string) {
  return value
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^option\s+\d+\s*:\s*/i, '')
    .replace(/^(revision|variation)\s*:\s*/i, '')
    .replace(/^(please|kindly|can you|could you|i need|i want|create|generate|make|use)\s+/i, '')
    .replace(/\s+(please|okay|ok)$/i, '')
    .replace(/[?.!,;:]+$/g, '')
    .trim();
}

export function compactDisplayName(value: unknown, fallback = 'Creative') {
  const raw = asString(value);
  const cleaned = raw ? stripNoise(raw) : '';
  const normalized = cleaned.toLowerCase();

  if (!cleaned || genericNames.has(normalized)) {
    return fallback;
  }

  return trimToLength(titleCase(cleaned));
}

export function isWeakDisplayName(value: unknown) {
  const raw = asString(value);

  if (!raw) {
    return true;
  }

  const cleaned = stripNoise(raw);
  const normalized = cleaned.toLowerCase();

  return (
    !cleaned ||
    genericNames.has(normalized) ||
    /^creative from json(\s+v\d+)?$/i.test(cleaned) ||
    /^json\s+v\d+$/i.test(cleaned) ||
    /^revision\b/i.test(raw) ||
    /^variation\b/i.test(raw) ||
    /^option\s+\d+/i.test(raw) ||
    cleaned.split(/\s+/).length > 8 ||
    /\b(please|kindly|can you|could you|i dont|i don't|i need|i want|not like)\b/i.test(raw)
  );
}

function campaignNameFromParts(input: {
  campaignType?: unknown;
  industry?: unknown;
  subject?: unknown;
}) {
  const campaignType = asString(input.campaignType);
  const industry = asString(input.industry);
  const subject = asString(input.subject);
  const cleanCampaign = campaignType
    ? stripNoise(campaignType).replace(/\b(campaign|creative|prompt)\b/gi, '').trim()
    : '';
  const cleanIndustry = industry ? stripNoise(industry) : '';
  const cleanSubject = subject ? stripNoise(subject) : '';

  if (cleanCampaign && cleanIndustry && !cleanCampaign.toLowerCase().includes(cleanIndustry.toLowerCase())) {
    return compactDisplayName(`${cleanIndustry} ${cleanCampaign}`);
  }

  if (cleanCampaign) {
    return compactDisplayName(cleanCampaign);
  }

  if (cleanSubject) {
    return compactDisplayName(cleanSubject);
  }

  if (cleanIndustry) {
    return compactDisplayName(`${cleanIndustry} Creative`);
  }

  return undefined;
}

export function displayNameFromPromptContext(input: {
  sessionTitle?: unknown;
  generatedJson?: JsonObject;
  promptMetadata?: JsonObject;
  creativeContext?: CreativeContext;
  imageAnalysis?: ImageAnalysis;
}) {
  const promptMetadata = asRecord(input.promptMetadata);
  const generatedJson = asRecord(input.generatedJson);
  const campaign = asRecord(generatedJson.campaign);
  const visualDirection = asRecord(generatedJson.visualDirection);
  const creativeContext = asRecord(input.creativeContext);
  const imageAnalysis = asRecord(input.imageAnalysis);
  const sessionTitle = asString(input.sessionTitle);
  const metadataTitle =
    asString(promptMetadata.sessionTitle) ??
    asString(promptMetadata.manualTitle) ??
    asString(promptMetadata.title);
  const generatedTitle = asString(generatedJson.title);
  const displayTitle = asString(promptMetadata.displayTitle);

  if (sessionTitle && !isWeakDisplayName(sessionTitle)) {
    return compactDisplayName(sessionTitle);
  }

  for (const candidate of [metadataTitle, generatedTitle, displayTitle]) {
    if (candidate && !isWeakDisplayName(candidate)) {
      return compactDisplayName(candidate);
    }
  }

  return (
    campaignNameFromParts({
      campaignType:
        campaign.type ?? creativeContext.campaignType ?? imageAnalysis.campaignType,
      industry: campaign.industry ?? creativeContext.industry ?? imageAnalysis.industry,
      subject: visualDirection.subject ?? creativeContext.subject ?? imageAnalysis.subject,
    }) ??
    (input.sessionTitle && !isWeakDisplayName(input.sessionTitle)
      ? compactDisplayName(input.sessionTitle)
      : 'Campaign Creative')
  );
}

export function displayNameForPromptSession(input: {
  requestedTitle?: unknown;
  creativeContext?: CreativeContext;
  imageAnalysis?: ImageAnalysis;
  generatedJson?: JsonObject;
  promptMetadata?: JsonObject;
}) {
  if (input.requestedTitle && !isWeakDisplayName(input.requestedTitle)) {
    return compactDisplayName(input.requestedTitle, 'Campaign Creative');
  }

  return displayNameFromPromptContext({
    sessionTitle: input.requestedTitle,
    generatedJson: input.generatedJson,
    promptMetadata: input.promptMetadata,
    creativeContext: input.creativeContext,
    imageAnalysis: input.imageAnalysis,
  });
}

export function displayNameForCreative(input: {
  userNote?: unknown;
  promptGeneration?: {
    generatedJson?: JsonObject;
    promptMetadata?: JsonObject;
    imageInsights?: ImageAnalysis;
  } | null;
}) {
  const userNote = asString(input.userNote);
  const baseName = input.promptGeneration
    ? displayNameFromPromptContext({
        generatedJson: input.promptGeneration.generatedJson,
        promptMetadata: input.promptGeneration.promptMetadata,
        imageAnalysis: input.promptGeneration.imageInsights,
      })
    : undefined;

  if (userNote && /^revision\s*:/i.test(userNote)) {
    return compactDisplayName(`Revision - ${baseName ?? 'Creative'}`);
  }

  if (userNote && /^variation\s*:/i.test(userNote)) {
    return compactDisplayName(`Variation - ${baseName ?? 'Creative'}`);
  }

  if (userNote && !isWeakDisplayName(userNote)) {
    return compactDisplayName(userNote);
  }

  return baseName ?? 'Campaign Creative';
}
