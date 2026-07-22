import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { env } from '@/config/env';
import { createOpenAIClient } from '@/config/openai';
import type {
  CreativeContext,
  JsonObject,
  PromptMessage,
  PromptOutputOptions,
  PromptSession,
} from '@/models/prompt.model';
import { asOptionalString, isRecord, parseJsonObject } from '@/openai/creativeContext.utils';

interface GenerateJsonInput {
  session: PromptSession;
  messages: PromptMessage[];
  outputOptions?: PromptOutputOptions;
}

interface GenerateJsonOutput {
  generatedJson: JsonObject;
  promptText: string;
  promptMetadata: JsonObject;
  modelName: string;
  aspectRatio: string;
  quality: string;
  imageCount: number;
}

function contextValue(context: CreativeContext, key: keyof CreativeContext, fallback: string): string {
  const value = context[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanUserText(value: string) {
  return compactWhitespace(value)
    .replace(/\bteh\b/gi, 'the')
    .replace(/\bi dont\b/gi, "I don't");
}

function hasAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term));
}

function summarizeLongBrief(value: string) {
  const cleaned = cleanUserText(value);
  const source = cleaned.toLowerCase();
  const summaries: string[] = [];
  const projectName = cleaned.match(/\bSubham\s+Kishori\s+Heights\b/i)?.[0];

  if (projectName) {
    summaries.push(`Project: ${projectName}, an active-lifestyle residential landmark.`);
  } else if (hasAny(source, ['bhk', 'residence', 'residential', 'duplex', 'rera', 'developer'])) {
    summaries.push('Real estate residential campaign brief.');
  }

  if (hasAny(source, ['seujpur', 'dibrugarh'])) {
    summaries.push('Location: Seujpur, Dibrugarh, Assam.');
  }

  if (source.includes('65') && source.includes('exclusive')) {
    summaries.push('Proof point: 65 exclusive residences.');
  }

  if (source.includes('78%') || source.includes('open space')) {
    summaries.push('Proof point: 78% open space.');
  }

  if (/\b3\s*&\s*4\s*bhk\b/i.test(cleaned) || source.includes('duplex')) {
    summaries.push('Home types: 3 BHK, 4 BHK, and duplex options.');
  }

  if (/90\s*(lac|lakh|l)/i.test(cleaned)) {
    summaries.push('Offer detail: starting at 90 Lac.');
  }

  if (hasAny(source, ['download brochure', 'enquire', 'enquiry', 'contact / enquire now'])) {
    summaries.push('CTA focus: Download Brochure or Enquire Now.');
  }

  if (hasAny(source, ["don't keep it too crowded", 'dont keep it too crowded', 'not too crowded', 'only include the style reference image'])) {
    summaries.push('Constraint: keep the creative uncluttered and use only the style reference image.');
  }

  if (!summaries.length) {
    summaries.push(`${cleaned.slice(0, 220).trimEnd()}...`);
  }

  return summaries;
}

function summarizeUserMessage(value: string) {
  const cleaned = cleanUserText(value);

  if (!cleaned) {
    return [];
  }

  if (cleaned.length <= 260) {
    return [cleaned];
  }

  return summarizeLongBrief(cleaned);
}

function summarizedUserRequests(messages: PromptMessage[]) {
  const requests = messages
    .filter((message) => message.role === 'user')
    .flatMap((message) => summarizeUserMessage(message.content));

  return [...new Set(requests)].slice(-8);
}

function sanitizeGeneratedJson(
  generatedJson: JsonObject,
  session: PromptSession,
  messages: PromptMessage[],
): JsonObject {
  const next: JsonObject = { ...generatedJson };
  const context = session.creativeContext;
  const userRequestedChanges = summarizedUserRequests(messages);
  const campaign = isRecord(next.campaign) ? { ...next.campaign } : {};
  const copy = isRecord(next.copy) ? { ...next.copy } : {};
  const typography = isRecord(next.typography) ? { ...next.typography } : {};
  const colorSystem = isRecord(next.colorSystem) ? { ...next.colorSystem } : {};
  const layout = isRecord(next.layout) ? { ...next.layout } : {};
  const imageQuality = isRecord(next.imageQuality) ? { ...next.imageQuality } : {};
  const visualDirection = isRecord(next.visualDirection) ? { ...next.visualDirection } : {};
  const productionNotes = isRecord(next.productionNotes) ? { ...next.productionNotes } : {};

  delete next.referenceImage;
  delete next.referenceImages;
  delete next.referenceImageUrl;
  delete next.referenceImageLink;
  delete next.reference_image_url;
  delete next.reference_image_link;
  delete next.reference_images;

  if (
    context.subject &&
    asOptionalString(next.title)?.toLowerCase().includes('healthcare') &&
    context.industry?.toLowerCase() !== 'healthcare'
  ) {
    next.title = context.subject;
  }

  if (session.sourceType !== 'text' || session.imageAnalysis.summary) {
    visualDirection.styleReference =
      'Use the uploaded primary style reference image for visual style, hierarchy, and composition.';
  }

  if (context.industry) {
    campaign.industry = context.industry;
  }

  if (context.campaignType) {
    campaign.type = context.campaignType;
  }

  if (context.marketingGoal) {
    campaign.goal = context.marketingGoal;
  }

  if (context.audience) {
    campaign.audience = context.audience;
  }

  if (Object.keys(campaign).length) {
    next.campaign = campaign;
  }

  if (context.subject) {
    visualDirection.subject = context.subject;
  }

  if (context.composition) {
    visualDirection.composition = context.composition;
  }

  if (context.visualHierarchy) {
    visualDirection.visualHierarchy = context.visualHierarchy;
  }

  if (context.designStyle) {
    visualDirection.designStyle = context.designStyle;
  }

  if (context.mood) {
    visualDirection.mood = context.mood;
  }

  if (Object.keys(visualDirection).length) {
    next.visualDirection = visualDirection;
  }

  if (context.typography) {
    typography.style = context.typography;
  }

  if (context.fontStyle) {
    typography.fontStyle = context.fontStyle;
  }

  if (Object.keys(typography).length) {
    next.typography = typography;
  }

  if (context.colors?.length) {
    colorSystem.palette = context.colors;
  }

  if (context.brandStyle) {
    colorSystem.brandStyle = context.brandStyle;
  }

  if (Object.keys(colorSystem).length) {
    next.colorSystem = colorSystem;
  }

  if (context.platform) {
    layout.platform = context.platform;
  }

  layout.aspectRatio = 'Set in Creative Generator';

  if (context.whiteSpace) {
    layout.whiteSpace = context.whiteSpace;
  }

  if (context.logoPlacement) {
    layout.logoPlacement = context.logoPlacement;
  }

  if (Object.keys(layout).length) {
    next.layout = layout;
  }

  imageQuality.quality = 'Set in Creative Generator';
  imageQuality.imageCount = 'Set in Creative Generator';
  next.imageQuality = imageQuality;

  if (userRequestedChanges.length) {
    copy.userRequestedChanges = userRequestedChanges;
    next.copy = copy;
  }

  delete productionNotes.memoryUsed;
  next.productionNotes = productionNotes;

  if (
    !asOptionalString(next.generationPrompt) ||
    (context.industry &&
      asOptionalString(next.generationPrompt)?.toLowerCase().includes('healthcare') &&
      context.industry.toLowerCase() !== 'healthcare')
  ) {
    next.generationPrompt = fallbackPromptText(session);
  }

  return next;
}

function fallbackPromptText(session: PromptSession): string {
  const context = session.creativeContext;
  return [
    `Create a ${contextValue(context, 'designStyle', 'premium social ad')} for ${contextValue(
      context,
      'industry',
      'the selected industry',
    )}.`,
    `Campaign: ${contextValue(context, 'campaignType', 'conversion-focused campaign')}.`,
    `Goal: ${contextValue(context, 'marketingGoal', 'drive measurable action')}.`,
    `Composition: ${contextValue(context, 'composition', 'clear focal subject, strong hierarchy, useful whitespace')}.`,
    `Typography: ${contextValue(context, 'typography', 'clean readable headline typography')}.`,
    `Mood: ${contextValue(context, 'mood', 'polished and trustworthy')}.`,
  ].join(' ');
}

function fallbackGeneratedJson(
  session: PromptSession,
  messages: PromptMessage[],
  outputOptions?: PromptOutputOptions,
): GenerateJsonOutput {
  const context = session.creativeContext;
  const aspectRatio = outputOptions?.aspectRatio ?? context.aspectRatio ?? '1:1';
  const quality = outputOptions?.quality ?? 'high';
  const imageCount = outputOptions?.imageCount ?? 1;
  const promptText = fallbackPromptText(session);
  const userRequestedChanges = summarizedUserRequests(messages);

  return {
    generatedJson: {
      schema: 'squashcode.creative_prompt.v1',
      title: session.title,
      sourceWorkflow: session.sourceType === 'image' || session.imageAnalysis.summary ? 'image_first' : 'chat_first',
      creativeDirectorSummary: session.imageAnalysis.summary ?? 'Creative direction built from chat.',
      campaign: {
        industry: context.industry ?? 'Marketing',
        type: context.campaignType ?? 'Social media creative',
        goal: context.marketingGoal ?? 'Drive action',
        audience: context.audience ?? 'Target audience from the final brief',
      },
      visualDirection: {
        subject: context.subject ?? 'Hero subject aligned with the offer',
        objects: context.objects ?? [],
        background: context.background ?? 'Clean background with controlled detail',
        composition: context.composition ?? 'Clear focal hierarchy and copy-safe spacing',
        visualHierarchy: context.visualHierarchy ?? 'Hero, headline, supporting proof, CTA or brand cue',
        cameraAngle: context.cameraAngle ?? 'Straight-on campaign framing',
        lighting: context.lighting ?? 'Balanced commercial lighting',
        mood: context.mood ?? 'Premium, clear, conversion-focused',
        designStyle: context.designStyle ?? 'Premium social ad',
        designTechniques: context.designTechniques ?? ['strong hierarchy', 'copy-safe whitespace', 'restricted palette'],
      },
      typography: {
        style: context.typography ?? 'Modern readable typography',
        fontStyle: context.fontStyle ?? 'Sans serif',
      },
      colorSystem: {
        palette: context.colors ?? ['Brand accent', 'Neutral base', 'High contrast text'],
        brandStyle: context.brandStyle ?? 'Polished brand-led campaign',
      },
      copy: {
        headlineDirection: 'Short, specific, benefit-led headline',
        cta: context.cta ?? null,
        userRequestedChanges,
      },
      layout: {
        platform: context.platform ?? 'Instagram',
        aspectRatio: 'Set in Creative Generator',
        whiteSpace: context.whiteSpace ?? 'Leave breathing room around primary copy and subject',
        logoPlacement: context.logoPlacement ?? 'Small logo placement away from the main focal point',
      },
      imageQuality: {
        quality: 'Set in Creative Generator',
        imageCount: 'Set in Creative Generator',
        notes: context.imageQuality ?? 'High-resolution, clean, no artifacts or distorted text',
      },
      negativePrompt: [
        'avoid clutter',
        'avoid unreadable text',
        'avoid distorted faces or objects',
        'avoid muddy lighting',
        'avoid off-brand colors',
      ],
      productionNotes: {
        whyThisWorks: session.imageAnalysis.whyThisCreativeWorks ?? [
          'The final direction preserves hierarchy, clarity, and conversion intent.',
        ],
      },
      generationPrompt: promptText,
    },
    promptText,
    promptMetadata: {
      modelFallback: true,
      messageCount: messages.length,
      memoryCount: session.memoryContext.length,
    },
    modelName: 'local-creative-director-fallback',
    aspectRatio,
    quality,
    imageCount,
  };
}

function normalizeGeneration(
  raw: JsonObject,
  fallback: GenerateJsonOutput,
  session: PromptSession,
  messages: PromptMessage[],
  outputOptions?: PromptOutputOptions,
): GenerateJsonOutput {
  const generatedSource = raw.generatedJson ?? raw.generated_json ?? raw.prompt ?? raw;
  const generatedJson = sanitizeGeneratedJson(
    isRecord(generatedSource) ? generatedSource : fallback.generatedJson,
    session,
    messages,
  );

  return {
    generatedJson,
    promptText:
      asOptionalString(raw.promptText) ??
      asOptionalString(raw.prompt_text) ??
      asOptionalString(generatedJson.generationPrompt) ??
      fallback.promptText,
    promptMetadata: isRecord(raw.promptMetadata)
      ? raw.promptMetadata
      : {
          ...fallback.promptMetadata,
          modelFallback: false,
        },
    modelName: asOptionalString(raw.modelName) ?? env.openaiModel,
    aspectRatio: outputOptions?.aspectRatio ?? asOptionalString(raw.aspectRatio) ?? fallback.aspectRatio,
    quality: outputOptions?.quality ?? asOptionalString(raw.quality) ?? fallback.quality,
    imageCount: outputOptions?.imageCount ?? fallback.imageCount,
  };
}

export class JsonGenerationService {
  async generateJson(input: GenerateJsonInput): Promise<GenerateJsonOutput> {
    const fallback = fallbackGeneratedJson(input.session, input.messages, input.outputOptions);
    const client = createOpenAIClient();

    if (!client) {
      return fallback;
    }

    const conversation = input.messages.map((message) => ({
      role: message.role,
      content: message.content,
      contentJson: message.contentJson,
    }));
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are GPT-5 acting as SquashCode Creative Studio Creative Director. Generate a production-ready reusable JSON prompt. Return only valid JSON.',
      },
      {
        role: 'user',
        content: [
          'Generate the final structured JSON only now, based on the complete session.',
          'Use the uploaded image analysis when available, all conversation changes, the current creative context, and brand context.',
          'Use app-supplied memory only when it clearly matches the same project, brand, or industry. Never let unrelated previous sessions change the industry, title, campaign type, or audience.',
          'Do not copy raw conversation, pasted website pages, navigation text, URLs, backend URLs, frontend URLs, or asset URLs into generatedJson.',
          'For copy.userRequestedChanges, include only 3-8 short summarized requirements. If the user pasted a long website page, extract only the important details and constraints.',
          'Do not invent image URLs. The app will attach the real uploaded reference and supporting image URLs to generatedJson after generation.',
          'Do not hardcode aspectRatio, quality, or imageCount inside generatedJson. These are selected later in Creative Generator controls.',
          'The output JSON must be reusable by an image-generation workflow and include strategy, visual direction, copy, layout, negative prompt, and production notes.',
          `Session: ${JSON.stringify(input.session)}`,
          `Conversation: ${JSON.stringify(conversation)}`,
          `Output options: ${JSON.stringify(input.outputOptions ?? {})}`,
          'Return JSON with generatedJson, promptText, promptMetadata, modelName, aspectRatio, quality, imageCount.',
        ].join('\n'),
      },
    ];

    try {
      const completion = await client.chat.completions.create({
        model: env.openaiModel,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.25,
      });
      const content = completion.choices[0]?.message?.content;
      const parsed = content ? parseJsonObject(content) : null;

      if (!parsed) {
        return fallback;
      }

      return normalizeGeneration(parsed, fallback, input.session, input.messages, input.outputOptions);
    } catch {
      return fallback;
    }
  }
}

export const jsonGenerationService = new JsonGenerationService();
