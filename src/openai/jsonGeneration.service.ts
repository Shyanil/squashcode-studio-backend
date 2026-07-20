import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { env } from '@/config/env';
import { createOpenAIClient } from '@/config/openai';
import type {
  CreativeContext,
  JsonObject,
  PromptMemoryItem,
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
  const userTurns = messages.filter((message) => message.role === 'user').map((message) => message.content);

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
        userRequestedChanges: userTurns,
      },
      layout: {
        platform: context.platform ?? 'Instagram',
        aspectRatio,
        whiteSpace: context.whiteSpace ?? 'Leave breathing room around primary copy and subject',
        logoPlacement: context.logoPlacement ?? 'Small logo placement away from the main focal point',
      },
      imageQuality: {
        quality,
        imageCount,
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
        memoryUsed: session.memoryContext.map((item: PromptMemoryItem) => ({
          sessionId: item.sessionId,
          reason: item.reason,
        })),
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
  outputOptions?: PromptOutputOptions,
): GenerateJsonOutput {
  const generatedSource = raw.generatedJson ?? raw.generated_json ?? raw.prompt ?? raw;
  const generatedJson = isRecord(generatedSource) ? generatedSource : fallback.generatedJson;

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
          'Use the uploaded image analysis when available, all conversation changes, the current creative context, brand context, and app-supplied memory.',
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

      return normalizeGeneration(parsed, fallback, input.outputOptions);
    } catch {
      return fallback;
    }
  }
}

export const jsonGenerationService = new JsonGenerationService();
