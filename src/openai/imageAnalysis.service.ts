import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { env } from '@/config/env';
import { createOpenAIClient } from '@/config/openai';
import type { CreativeContext, ImageAnalysis, JsonObject, PromptUploadedImage } from '@/models/prompt.model';
import {
  asOptionalString,
  asStringArray,
  fallbackContextFromText,
  isRecord,
  parseJsonObject,
} from '@/openai/creativeContext.utils';

interface AnalyzeImageInput {
  image: PromptUploadedImage;
  promptText?: string;
  brandContext?: JsonObject;
  memoryContext?: JsonObject[];
}

const analysisFields = [
  'industry',
  'campaignType',
  'marketingGoal',
  'subject',
  'objects',
  'background',
  'composition',
  'visualHierarchy',
  'typography',
  'fontStyle',
  'colors',
  'brandStyle',
  'mood',
  'lighting',
  'cameraAngle',
  'cta',
  'whiteSpace',
  'logoPlacement',
  'designStyle',
  'platform',
  'aspectRatio',
  'imageQuality',
  'designTechniques',
  'whyThisCreativeWorks',
  'creativeContext',
];

function fallbackAnalysis(input: AnalyzeImageInput): ImageAnalysis {
  const source = `${input.image.fileName} ${input.promptText ?? ''}`;
  const inferredContext = fallbackContextFromText(source);
  const industry = inferredContext.industry ?? 'Marketing';
  const campaignType = inferredContext.campaignType ?? 'Social media creative';
  const colors = inferredContext.colors ?? ['High contrast accent', 'Clean neutral base', 'Supporting brand color'];
  const platform = inferredContext.platform ?? 'Instagram';
  const aspectRatio = inferredContext.aspectRatio ?? '1:1';

  return {
    summary: `Reference image analyzed as a ${campaignType.toLowerCase()} for ${industry}.`,
    industry,
    campaignType,
    marketingGoal: inferredContext.marketingGoal ?? 'Create attention, communicate value, and drive action',
    subject: inferredContext.subject ?? 'Primary offer or hero subject from the uploaded creative',
    objects: inferredContext.objects ?? ['hero subject', 'supporting copy', 'brand or CTA area'],
    background: inferredContext.background ?? 'Clean campaign background with controlled visual noise',
    composition: inferredContext.composition ?? 'Clear focal hierarchy with enough whitespace for copy',
    visualHierarchy: inferredContext.visualHierarchy ?? 'Hero visual first, headline second, CTA or brand cue third',
    typography: inferredContext.typography ?? 'Readable campaign typography with strong headline contrast',
    fontStyle: inferredContext.fontStyle ?? 'Modern sans serif',
    colors,
    brandStyle: inferredContext.brandStyle ?? 'Polished and conversion-focused',
    mood: inferredContext.mood ?? 'Confident, clear, premium',
    lighting: inferredContext.lighting ?? 'Balanced, clean lighting suitable for a social advertisement',
    cameraAngle: inferredContext.cameraAngle ?? 'Straight-on campaign framing',
    cta: inferredContext.cta ?? 'Add a clear CTA if the final brief requires one',
    whiteSpace: inferredContext.whiteSpace ?? 'Structured whitespace around the focal message',
    logoPlacement: inferredContext.logoPlacement ?? 'Small brand area away from the main subject',
    designStyle: inferredContext.designStyle ?? 'Premium social ad',
    platform,
    aspectRatio,
    imageQuality: 'Production-ready reference; preserve clarity and avoid noisy artifacts',
    designTechniques: inferredContext.designTechniques ?? [
      'clear focal point',
      'copy-safe spacing',
      'restricted palette',
      'obvious conversion path',
    ],
    whyThisCreativeWorks: [
      'The hierarchy makes the offer scannable before the user scrolls.',
      'The layout leaves room for brand and CTA without fighting the hero visual.',
      'The restrained palette helps the creative feel intentional and reusable.',
    ],
    creativeContext: inferredContext,
    modelUsed: 'local-creative-director-fallback',
  };
}

function normalizeAnalysis(raw: JsonObject, fallback: ImageAnalysis): ImageAnalysis {
  const creativeContextSource = raw.creativeContext ?? raw.creative_context;
  const creativeContext = isRecord(creativeContextSource) ? (creativeContextSource as CreativeContext) : {};

  return {
    summary: asOptionalString(raw.summary) ?? fallback.summary,
    industry: asOptionalString(raw.industry) ?? fallback.industry,
    campaignType: asOptionalString(raw.campaignType) ?? asOptionalString(raw.campaign_type) ?? fallback.campaignType,
    marketingGoal: asOptionalString(raw.marketingGoal) ?? asOptionalString(raw.marketing_goal) ?? fallback.marketingGoal,
    subject: asOptionalString(raw.subject) ?? fallback.subject,
    objects: asStringArray(raw.objects) ?? fallback.objects,
    background: asOptionalString(raw.background) ?? fallback.background,
    composition: asOptionalString(raw.composition) ?? fallback.composition,
    visualHierarchy:
      asOptionalString(raw.visualHierarchy) ?? asOptionalString(raw.visual_hierarchy) ?? fallback.visualHierarchy,
    typography: asOptionalString(raw.typography) ?? fallback.typography,
    fontStyle: asOptionalString(raw.fontStyle) ?? asOptionalString(raw.font_style) ?? fallback.fontStyle,
    colors: asStringArray(raw.colors) ?? fallback.colors,
    brandStyle: asOptionalString(raw.brandStyle) ?? asOptionalString(raw.brand_style) ?? fallback.brandStyle,
    mood: asOptionalString(raw.mood) ?? fallback.mood,
    lighting: asOptionalString(raw.lighting) ?? fallback.lighting,
    cameraAngle: asOptionalString(raw.cameraAngle) ?? asOptionalString(raw.camera_angle) ?? fallback.cameraAngle,
    cta: raw.cta === null ? null : (asOptionalString(raw.cta) ?? fallback.cta),
    whiteSpace: asOptionalString(raw.whiteSpace) ?? asOptionalString(raw.white_space) ?? fallback.whiteSpace,
    logoPlacement: asOptionalString(raw.logoPlacement) ?? asOptionalString(raw.logo_placement) ?? fallback.logoPlacement,
    designStyle: asOptionalString(raw.designStyle) ?? asOptionalString(raw.design_style) ?? fallback.designStyle,
    platform: asOptionalString(raw.platform) ?? fallback.platform,
    aspectRatio: asOptionalString(raw.aspectRatio) ?? asOptionalString(raw.aspect_ratio) ?? fallback.aspectRatio,
    imageQuality: asOptionalString(raw.imageQuality) ?? asOptionalString(raw.image_quality) ?? fallback.imageQuality,
    designTechniques:
      asStringArray(raw.designTechniques) ?? asStringArray(raw.design_techniques) ?? fallback.designTechniques,
    whyThisCreativeWorks:
      asStringArray(raw.whyThisCreativeWorks) ??
      asStringArray(raw.why_this_creative_works) ??
      fallback.whyThisCreativeWorks,
    creativeContext: {
      ...(fallback.creativeContext ?? {}),
      ...creativeContext,
    },
    modelUsed: asOptionalString(raw.modelUsed) ?? env.openaiModel,
  };
}

export class ImageAnalysisService {
  async analyzeImage(input: AnalyzeImageInput): Promise<ImageAnalysis> {
    const fallback = fallbackAnalysis(input);
    const client = createOpenAIClient();

    if (!client) {
      return fallback;
    }

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are GPT-5 acting as an AI Creative Director for SquashCode Creative Studio. Analyze uploaded ad creatives deeply: infer strategic intent, visual technique, hierarchy, and reusable creative direction. Return only valid JSON.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Analyze this reference creative for a JSON Prompt Generator session.',
              `Return a JSON object with these camelCase fields: ${analysisFields.join(', ')}.`,
              'The creativeContext field must be a compact reusable object for future generation.',
              'Explain why the creative works, not only what is visible.',
              'Use relevant previous memory only when it clearly matches the same project, brand, or industry. Never let unrelated previous sessions override the uploaded image or user note.',
              `User note: ${input.promptText?.trim() || 'No extra note provided.'}`,
              `Brand context: ${JSON.stringify(input.brandContext ?? {})}`,
              `Relevant previous memory: ${JSON.stringify(input.memoryContext ?? [])}`,
            ].join('\n'),
          },
          {
            type: 'image_url',
            image_url: {
              url: input.image.dataUrl,
            },
          },
        ],
      },
    ];

    try {
      const completion = await client.chat.completions.create({
        model: env.openaiModel,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      const content = completion.choices[0]?.message?.content;
      const parsed = content ? parseJsonObject(content) : null;

      if (!parsed) {
        return fallback;
      }

      return normalizeAnalysis(parsed, fallback);
    } catch {
      return fallback;
    }
  }
}

export const imageAnalysisService = new ImageAnalysisService();
