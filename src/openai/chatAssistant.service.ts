import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { env } from '@/config/env';
import { createOpenAIClient } from '@/config/openai';
import type {
  CreativeContext,
  ImageAnalysis,
  JsonObject,
  PromptMemoryItem,
  PromptMessage,
} from '@/models/prompt.model';
import {
  asOptionalString,
  asStringArray,
  fallbackContextFromText,
  isRecord,
  mergeCreativeContext,
  parseJsonObject,
} from '@/openai/creativeContext.utils';

interface AssistantResponseInput {
  userMessage: string;
  currentContext: CreativeContext;
  imageAnalysis?: ImageAnalysis;
  brandContext?: JsonObject;
  memoryContext?: PromptMemoryItem[];
  messages?: PromptMessage[];
  latestGeneratedJson?: JsonObject;
}

interface AssistantResponseOutput {
  assistantMessage: string;
  updatedContext: CreativeContext;
  contextPatch: CreativeContext;
  unresolvedQuestions: string[];
  modelName: string;
}

function questionList(context: CreativeContext): string[] {
  const questions: string[] = [];

  if (!context.industry) {
    questions.push('Which industry or brand category should this creative serve?');
  }

  if (!context.marketingGoal) {
    questions.push('What is the main marketing goal: awareness, leads, sales, or engagement?');
  }

  if (!context.platform) {
    questions.push('Which platform and format should I optimize for?');
  }

  if (context.cta === undefined) {
    questions.push('Should the final creative include a CTA?');
  }

  return questions.slice(0, 3);
}

function includesAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term));
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function compactUserRequest(message: string) {
  const cleaned = compactWhitespace(message)
    .replace(/\bteh\b/gi, 'the')
    .replace(/\bi dont\b/gi, "I don't");

  if (cleaned.length <= 260) {
    return cleaned;
  }

  const projectName = cleaned.match(/\bSubham\s+Kishori\s+Heights\b/i)?.[0];

  if (projectName) {
    return `${projectName} real estate brief: keep only key project details, keep the output uncluttered, and use the uploaded style reference image.`;
  }

  return `${cleaned.slice(0, 220).trimEnd()}...`;
}

const contextLabels: Record<string, string> = {
  audience: 'audience',
  background: 'background',
  brandStyle: 'brand style',
  cameraAngle: 'camera angle',
  campaignType: 'campaign type',
  colors: 'color palette',
  composition: 'layout/composition',
  constraints: 'constraints',
  cta: 'CTA',
  designStyle: 'design style',
  designTechniques: 'design techniques',
  fontStyle: 'font pairing',
  imageQuality: 'image quality',
  industry: 'industry',
  lighting: 'lighting',
  logoPlacement: 'logo placement',
  marketingGoal: 'marketing goal',
  mood: 'mood',
  objects: 'objects',
  platform: 'platform',
  subject: 'subject',
  typography: 'typography',
  visualHierarchy: 'visual hierarchy',
  whiteSpace: 'spacing',
};

function changedContextLabels(contextPatch: CreativeContext) {
  return Object.keys(contextPatch)
    .filter((key) => key !== 'userRequests' && contextPatch[key] !== undefined)
    .map((key) => contextLabels[key] ?? key)
    .slice(0, 5);
}

function isVagueFutureResponse(message: string) {
  const source = message.toLowerCase();

  return (
    source.length < 45 ||
    includesAny(source, [
      'i will make',
      "i'll make",
      'i will apply',
      "i'll apply",
      'after final json',
      'when generating the final json',
      'once you generate json',
      'when you generate json',
      'i understand',
      'understood',
    ])
  );
}

function concreteAssistantResponse(input: {
  contextPatch: CreativeContext;
  unresolvedQuestions: string[];
}) {
  const labels = changedContextLabels(input.contextPatch);
  const changeSummary = labels.length ? labels.join(', ') : 'your latest note';
  const nextQuestion = input.unresolvedQuestions[0];

  if (nextQuestion) {
    return `Done — I updated the working direction now: ${changeSummary}. The next JSON generation uses this updated draft. One thing that would make it sharper: ${nextQuestion}`;
  }

  return `Done — I updated the working direction now: ${changeSummary}. The next JSON generation uses this updated draft. You can add another change or click Generate JSON.`;
}

function typographyPatchFromText(message: string): CreativeContext | null {
  const source = message.toLowerCase();
  const isTypographyMessage = includesAny(source, [
    'font',
    'fonts',
    'typography',
    'typeface',
    'poppins',
    'poopins',
    'dm sans',
    'dn sans',
  ]);

  if (!isTypographyMessage) {
    return null;
  }

  const wantsPoppins = includesAny(source, ['poppins', 'poopins']);
  const wantsDmSans = includesAny(source, ['dm sans', 'dn sans', 'dmsans']);
  const wantsItalic = includesAny(source, ['italic', 'italics']);
  const recommendedPair =
    wantsItalic
      ? wantsPoppins
        ? 'Poppins Italic headline with clean sans-serif body/supporting copy'
        : 'Elegant italic headline with clean sans-serif body/supporting copy'
      : wantsPoppins || wantsDmSans
      ? 'Poppins headline with DM Sans body/supporting copy'
      : 'Poppins headline with DM Sans body/supporting copy';

  return {
    typography: wantsItalic
      ? 'Replace the weak typography with a refined italic-forward headline style and clean readable supporting type for body copy, offer details, and CTA.'
      : 'Replace the weak typography with a sharper modern system: Poppins SemiBold/Bold for the main headline, DM Sans Regular/Medium for body copy, offer details, and CTA.',
    fontStyle: recommendedPair,
    designTechniques: [
      'strong typographic hierarchy',
      wantsItalic ? 'refined italic headline treatment' : 'clean sans-serif pairing',
      'improved headline/body contrast',
    ],
    constraints: [
      wantsItalic
        ? 'Use italic typography intentionally for the headline; keep body text highly readable.'
        : 'Use consistent font weights; avoid decorative or low-readability typefaces.',
    ],
  };
}

function fallbackAssistantResponse(input: AssistantResponseInput): AssistantResponseOutput {
  const textPatch = fallbackContextFromText(input.userMessage);
  const contextPatch: CreativeContext = {
    ...textPatch,
    userRequests: [compactUserRequest(input.userMessage)],
  };
  const lowerMessage = input.userMessage.toLowerCase();
  const typographyPatch = typographyPatchFromText(input.userMessage);

  if (typographyPatch) {
    Object.assign(contextPatch, typographyPatch);
  }

  if (lowerMessage.includes('remove') && lowerMessage.includes('cta')) {
    contextPatch.cta = null;
  }

  if (lowerMessage.includes('more premium') || lowerMessage.includes('premium')) {
    contextPatch.mood = 'More premium, polished, and aspirational';
    contextPatch.designStyle = input.currentContext.designStyle ?? 'Premium minimal';
    contextPatch.whiteSpace = 'Increase whitespace and reduce visual clutter';
  }

  if (lowerMessage.includes('keep') && lowerMessage.includes('layout')) {
    contextPatch.composition = 'Keep the uploaded reference layout and hierarchy';
  }

  if (
    includesAny(lowerMessage, [
      'make it better',
      'make design better',
      'design better',
      'improve design',
      'more professional',
      'more modern',
      'cleaner',
    ])
  ) {
    contextPatch.designStyle = 'Cleaner, more polished, more professional campaign design';
    contextPatch.visualHierarchy =
      'Stronger hierarchy with a clear hero, headline, supporting details, and CTA/brand cue';
    contextPatch.whiteSpace = 'More controlled whitespace and less clutter';
    contextPatch.imageQuality = 'Sharper, production-ready finish with no low-quality artifacts';
  }

  const updatedContext = mergeCreativeContext(input.currentContext, contextPatch);
  const unresolvedQuestions = questionList(updatedContext);
  const changedKeys = Object.keys(contextPatch).filter((key) => key !== 'userRequests');
  let assistantMessage: string;

  if (typographyPatch) {
    assistantMessage =
      'Yes, Poppins plus DM Sans is a stronger direction. I would use Poppins SemiBold or Bold for the headline because it feels confident and premium, then DM Sans for body text, offer details, and CTA because it stays clean at small sizes. I updated the draft typography direction with that pairing. You can keep refining anything else, or click Generate JSON when this feels right.';
  } else {
    const firstSentence = changedKeys.length
      ? `I updated the draft direction for ${changedKeys.join(', ')}.`
      : 'I captured that note in the draft direction.';
    const revisionContext = input.latestGeneratedJson
      ? ' This is now captured as a revision to the current JSON draft.'
      : '';
    assistantMessage = unresolvedQuestions.length
      ? `${firstSentence}${revisionContext} To make the final JSON sharper: ${unresolvedQuestions[0]}`
      : `${firstSentence}${revisionContext} You can keep chatting to refine the base direction, then click Generate JSON when you want the final version.`;
  }

  return {
    assistantMessage: isVagueFutureResponse(assistantMessage)
      ? concreteAssistantResponse({ contextPatch, unresolvedQuestions })
      : assistantMessage,
    updatedContext,
    contextPatch,
    unresolvedQuestions,
    modelName: 'local-creative-director-fallback',
  };
}

function normalizeAssistantOutput(
  raw: JsonObject,
  fallback: AssistantResponseOutput,
): AssistantResponseOutput {
  const patchSource = raw.creativeContextPatch ?? raw.creative_context_patch ?? raw.contextPatch;
  const updatedSource =
    raw.updatedCreativeContext ?? raw.updated_creative_context ?? raw.updatedContext;
  const rawContextPatch = isRecord(patchSource) ? (patchSource as CreativeContext) : {};
  const contextPatch = mergeCreativeContext(fallback.contextPatch, rawContextPatch);
  if (Array.isArray(contextPatch.userRequests)) {
    contextPatch.userRequests = contextPatch.userRequests
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(compactUserRequest)
      .slice(-6);
  }
  const updatedContext = isRecord(updatedSource)
    ? mergeCreativeContext(updatedSource as CreativeContext, contextPatch)
    : mergeCreativeContext(fallback.updatedContext, contextPatch);
  const unresolvedQuestions =
    asStringArray(raw.unresolvedQuestions) ??
    asStringArray(raw.unresolved_questions) ??
    questionList(updatedContext);
  const rawAssistantMessage =
    asOptionalString(raw.assistantResponse) ??
    asOptionalString(raw.assistant_response) ??
    asOptionalString(raw.message) ??
    fallback.assistantMessage;

  return {
    assistantMessage: isVagueFutureResponse(rawAssistantMessage)
      ? concreteAssistantResponse({ contextPatch, unresolvedQuestions })
      : rawAssistantMessage,
    updatedContext,
    contextPatch,
    unresolvedQuestions,
    modelName: asOptionalString(raw.modelName) ?? env.openaiModel,
  };
}

export class ChatAssistantService {
  async createAssistantResponse(input: AssistantResponseInput): Promise<AssistantResponseOutput> {
    const fallback = fallbackAssistantResponse(input);
    const client = createOpenAIClient();

    if (!client) {
      return fallback;
    }

    const conversation = (input.messages ?? []).slice(-12).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are GPT-5 acting as the SquashCode AI Creative Director. Maintain one evolving creative context and help the user refine it through conversation before final JSON generation. User chat messages are edits to the working draft, not casual acknowledgements. Apply every requested change immediately in creativeContextPatch and updatedCreativeContext. Never say you will make the change later, after final JSON, or when JSON is generated. Never rebuild from scratch unless explicitly asked. Return only valid JSON.',
      },
      {
        role: 'user',
        content: [
          'Update the creative direction from this latest user message.',
          'Return JSON with: assistantResponse, creativeContextPatch, updatedCreativeContext, unresolvedQuestions, modelName.',
          'The assistantResponse must confirm exactly what changed in the working draft now. Start with a concise phrase like "Done — I updated..." and name the changed areas. If the user asks for an opinion, give a recommendation and update the draft.',
          'creativeContextPatch must include userRequests as a compact summary of the latest request, not raw pasted website/page text. Also include concrete fields such as composition, typography, colors, visualHierarchy, designStyle, mood, cta, constraints, or imageQuality when relevant.',
          'If the user pasted a long website page or brochure text, extract only important campaign details and constraints. Do not keep navigation text, duplicate sections, full page copy, URLs, backend URLs, frontend URLs, or asset URLs.',
          'Use app-supplied memory only when it clearly matches the same project, brand, or industry. Never let unrelated previous sessions change the industry, title, campaign type, or audience.',
          'If latestGeneratedJson exists, treat the user message as a revision to that base JSON draft; do not generate final JSON in chat.',
          `Current creative context: ${JSON.stringify(input.currentContext)}`,
          `Image analysis: ${JSON.stringify(input.imageAnalysis ?? {})}`,
          `Latest generated JSON draft: ${JSON.stringify(input.latestGeneratedJson ?? {})}`,
          `Brand context: ${JSON.stringify(input.brandContext ?? {})}`,
          `Relevant memory supplied by app: ${JSON.stringify(input.memoryContext ?? [])}`,
          `Recent conversation: ${JSON.stringify(conversation)}`,
          `Latest user message: ${input.userMessage}`,
        ].join('\n'),
      },
    ];

    try {
      const completion = await client.chat.completions.create({
        model: env.openaiModel,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      const content = completion.choices[0]?.message?.content;
      const parsed = content ? parseJsonObject(content) : null;

      if (!parsed) {
        return fallback;
      }

      return normalizeAssistantOutput(parsed, fallback);
    } catch {
      return fallback;
    }
  }
}

export const chatAssistantService = new ChatAssistantService();
