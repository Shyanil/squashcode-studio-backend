import { randomUUID } from 'crypto';

import {
  imageAnalysisToContext,
  isRecord,
  mergeCreativeContext,
} from '@/openai/creativeContext.utils';
import { cpanelAssetService, normalizeCpanelAssetUrl } from '@/services/cpanelAsset.service';
import { chatAssistantService } from '@/openai/chatAssistant.service';
import { imageAnalysisService } from '@/openai/imageAnalysis.service';
import { jsonGenerationService } from '@/openai/jsonGeneration.service';
import type {
  CreativeContext,
  ImageAnalysis,
  JsonObject,
  PromptAsset,
  PromptGeneration,
  PromptMemoryItem,
  PromptMessage,
  PromptMessageRole,
  PromptOutputOptions,
  PromptSession,
  PromptSourceType,
  PromptUploadedImage,
} from '@/models/prompt.model';
import { supabaseClient } from '@/supabase/client';
import { HttpError } from '@/utils/httpError';
import {
  displayNameForPromptSession,
  displayNameFromPromptContext,
} from '@/utils/displayName';

export const LOCAL_PROMPT_USER_ID = '00000000-0000-4000-8000-000000000001';

interface CreateSessionInput {
  userId?: string;
  title?: string;
  sourceType?: PromptSourceType;
  brandContext?: JsonObject;
  metadata?: JsonObject;
}

interface AnalyzeSessionImageInput {
  userId?: string;
  sessionId: string;
  image: PromptUploadedImage;
  promptText?: string;
}

interface AddSessionAssetInput {
  userId?: string;
  sessionId: string;
  image: PromptUploadedImage;
  assetRole?: string;
}

interface SendMessageInput {
  userId?: string;
  sessionId: string;
  content: string;
}

interface GenerateSessionJsonInput {
  userId?: string;
  sessionId: string;
  outputOptions?: PromptOutputOptions;
}

interface ListSessionsInput {
  userId?: string;
}

interface PromptSessionDetail {
  session: PromptSession;
  messages: PromptMessage[];
  generations: PromptGeneration[];
  assets: PromptAsset[];
}

type SupabaseRow = Record<string, unknown>;

const promptAssetBucket = 'prompt-generator-assets';
const signedReferenceImageTtlSeconds = 60 * 60 * 24 * 7;

function nowIso() {
  return new Date().toISOString();
}

function resolveUserId(userId?: string) {
  return userId?.trim() || LOCAL_PROMPT_USER_ID;
}

function userScopeIds(userId?: string) {
  return [...new Set([resolveUserId(userId), LOCAL_PROMPT_USER_ID])];
}

function shouldUseRemote(userId: string) {
  void userId;
  return Boolean(supabaseClient);
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' ? value : fallback;
}

function asJsonObject(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}

function asCreativeContext(value: unknown): CreativeContext {
  return isRecord(value) ? (value as CreativeContext) : {};
}

function asImageAnalysis(value: unknown): ImageAnalysis {
  return isRecord(value) ? (value as ImageAnalysis) : {};
}

function formatSupabaseError(error: unknown) {
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return 'Unknown Supabase error';
}

function throwSupabaseError(action: string, error: unknown): never {
  throw new HttpError(502, `Supabase ${action} failed: ${formatSupabaseError(error)}`);
}

function isMissingPromptAssetCpanelColumn(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'string' ? error.code : '';

  return (
    code === 'PGRST204' ||
    ['cpanel_type', 'cpanel_subfolder', 'cpanel_filename'].some((column) =>
      message.includes(column),
    )
  );
}

function referenceImageForJson(asset?: PromptAsset): JsonObject | undefined {
  if (!asset) {
    return undefined;
  }

  return {
    link: asset.url ?? null,
    url: asset.url ?? null,
    bucketName: asset.bucketName,
    storagePath: asset.storagePath,
    fileName: asset.fileName,
    mimeType: asset.mimeType ?? null,
    fileSize: asset.fileSize ?? null,
    role: typeof asset.metadata.assetRole === 'string' ? asset.metadata.assetRole : null,
    cpanelFilename: asset.cpanelFilename ?? null,
    cpanelSubfolder: asset.cpanelSubfolder ?? null,
    cpanelType: asset.cpanelType ?? null,
  };
}

function referenceImagesForJson(assets: PromptAsset[]): JsonObject[] {
  return assets.map(referenceImageForJson).filter((image): image is JsonObject => Boolean(image));
}

function withReferenceImages(
  generatedJson: JsonObject,
  referenceAssets: PromptAsset[],
): JsonObject {
  const referenceImages = referenceImagesForJson(referenceAssets);
  const referenceImage = referenceImages[0];

  if (!referenceImage) {
    return generatedJson;
  }

  return {
    ...generatedJson,
    referenceImage,
    referenceImages,
    referenceImageLink: referenceImage.link,
    referenceImageUrl: referenceImage.url,
    reference_image_link: referenceImage.link,
    reference_image_url: referenceImage.url,
    reference_images: referenceImages,
  };
}

function asMemoryItems(value: unknown): PromptMemoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is PromptMemoryItem => isRecord(item) && typeof item.sessionId === 'string',
  );
}

function asSourceType(value: unknown): PromptSourceType {
  return value === 'text' || value === 'image' || value === 'mixed' ? value : 'mixed';
}

function asMessageRole(value: unknown): PromptMessageRole {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : 'assistant';
}

function mapSession(row: SupabaseRow): PromptSession {
  const metadata = asJsonObject(row.metadata);
  const creativeContext = asCreativeContext(row.creative_context ?? metadata.creative_context);
  const imageAnalysis = asImageAnalysis(row.image_analysis ?? metadata.image_analysis);

  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    title: displayNameForPromptSession({
      requestedTitle: asString(row.title, 'Untitled prompt'),
      creativeContext,
      imageAnalysis,
    }),
    sourceType: asSourceType(row.source_type),
    status:
      row.status === 'draft' ||
      row.status === 'active' ||
      row.status === 'generated' ||
      row.status === 'archived'
        ? row.status
        : 'draft',
    brandContext: asJsonObject(row.brand_context),
    metadata,
    creativeContext,
    imageAnalysis,
    memoryContext: asMemoryItems(row.memory_context ?? metadata.memory_context),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso()),
    lastGeneratedAt: asNullableString(row.last_generated_at),
  };
}

function mapMessage(row: SupabaseRow): PromptMessage {
  return {
    id: asString(row.id),
    sessionId: asString(row.session_id),
    userId: asString(row.user_id),
    role: asMessageRole(row.role),
    content: asString(row.content),
    contentJson: asJsonObject(row.content_json),
    metadata: asJsonObject(row.metadata),
    createdAt: asString(row.created_at, nowIso()),
  };
}

function mapAsset(row: SupabaseRow): PromptAsset {
  const metadata = asJsonObject(row.metadata);

  return {
    id: asString(row.id),
    sessionId: asString(row.session_id),
    userId: asString(row.user_id),
    bucketName: asString(row.bucket_name, promptAssetBucket),
    storagePath: asString(row.storage_path),
    fileName: asString(row.file_name, 'reference-image'),
    mimeType: asNullableString(row.mime_type) ?? undefined,
    fileSize: row.file_size === null ? undefined : asNumber(row.file_size),
    width: row.width === null ? undefined : asNumber(row.width),
    height: row.height === null ? undefined : asNumber(row.height),
    url:
      normalizeCpanelAssetUrl(
        asNullableString(row.reference_image_url) ??
          asNullableString(metadata.referenceImageUrl) ??
          undefined,
      ) ?? undefined,
    cpanelFilename:
      asNullableString(row.cpanel_filename) ??
      asNullableString(metadata.cpanelFilename) ??
      undefined,
    cpanelSubfolder:
      asNullableString(row.cpanel_subfolder) ??
      asNullableString(metadata.cpanelSubfolder) ??
      undefined,
    cpanelType:
      row.cpanel_type === 'generation' || row.cpanel_type === 'reference'
        ? row.cpanel_type
        : metadata.cpanelType === 'generation' || metadata.cpanelType === 'reference'
          ? metadata.cpanelType
          : undefined,
    metadata,
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso()),
  };
}

function mapGeneration(row: SupabaseRow): PromptGeneration {
  const generatedJson = asJsonObject(row.generated_json);
  const promptMetadata = asJsonObject(row.prompt_metadata);
  const imageInsights = asImageAnalysis(row.image_insights);
  const creativeContext = asCreativeContext(row.creative_context_snapshot);
  const displayTitle = displayNameFromPromptContext({
    generatedJson,
    promptMetadata,
    creativeContext,
    imageAnalysis: imageInsights,
  });

  return {
    id: asString(row.id),
    sessionId: asString(row.session_id),
    userId: asString(row.user_id),
    versionNumber: asNumber(row.version_number, 1),
    promptText: asString(row.prompt_text),
    generatedJson: {
      ...generatedJson,
      title: displayTitle,
    },
    promptMetadata: {
      ...promptMetadata,
      displayTitle,
    },
    imageInsights,
    referenceImagePath: asNullableString(row.reference_image_path) ?? undefined,
    referenceImageUrl: normalizeCpanelAssetUrl(asNullableString(row.reference_image_url) ?? undefined),
    modelName: asNullableString(row.model_name) ?? undefined,
    aspectRatio: asString(row.aspect_ratio, '1:1'),
    quality: asString(row.quality, 'high'),
    imageCount: asNumber(row.image_count, 1),
    status: row.status === 'queued' || row.status === 'failed' ? row.status : 'completed',
    errorMessage: asNullableString(row.error_message),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso()),
  };
}

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'reference-image'
  );
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? '';
  const buffer = isBase64
    ? Buffer.from(data, 'base64')
    : Buffer.from(decodeURIComponent(data), 'utf8');

  return { buffer, mimeType };
}

function scoreMemoryItem(
  item: PromptMemoryItem,
  context: CreativeContext,
  brandContext: JsonObject,
) {
  let score = 0;
  const candidate = item.creativeContext;

  if (context.industry && candidate.industry === context.industry) {
    score += 3;
  }

  if (context.campaignType && candidate.campaignType === context.campaignType) {
    score += 2;
  }

  if (context.platform && candidate.platform === context.platform) {
    score += 1;
  }

  if (context.designStyle && candidate.designStyle === context.designStyle) {
    score += 1;
  }

  const brandName = typeof brandContext.name === 'string' ? brandContext.name : '';
  const candidateBrand = typeof item.brandName === 'string' ? item.brandName : '';

  if (brandName && candidateBrand && brandName === candidateBrand) {
    score += 3;
  }

  return score;
}

function createAnalysisMessage(analysis: ImageAnalysis) {
  const campaign = analysis.campaignType ?? 'creative campaign';
  const style = analysis.designStyle ?? 'campaign style';
  const hierarchy = analysis.visualHierarchy ?? 'clear visual hierarchy';

  return [
    `I analyzed your creative. It appears to be a ${campaign}.`,
    `I noticed ${style}, ${hierarchy}, and ${analysis.mood ?? 'a focused campaign mood'}.`,
    'What would you like to keep, remove, or improve before I generate the final JSON?',
  ].join(' ');
}

export class PromptService {
  private readonly sessions = new Map<string, PromptSession>();
  private readonly messages = new Map<string, PromptMessage[]>();
  private readonly assets = new Map<string, PromptAsset[]>();
  private readonly generations = new Map<string, PromptGeneration[]>();

  async createSession(input: CreateSessionInput): Promise<PromptSessionDetail> {
    const userId = resolveUserId(input.userId);
    const createdAt = nowIso();
    const brandContext = input.brandContext ?? {};
    const memoryContext = await this.findRelevantMemory(userId, {}, brandContext);
    const session: PromptSession = {
      id: randomUUID(),
      userId,
      title: displayNameForPromptSession({
        requestedTitle: input.title,
        creativeContext: {},
        imageAnalysis: {},
      }),
      sourceType: input.sourceType ?? 'mixed',
      status: 'active',
      brandContext,
      metadata: {
        ...(input.metadata ?? {}),
        memoryRetrievedAt: createdAt,
      },
      creativeContext: {},
      imageAnalysis: {},
      memoryContext,
      createdAt,
      updatedAt: createdAt,
      lastGeneratedAt: null,
    };

    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_sessions')
        .insert({
          id: session.id,
          user_id: userId,
          title: session.title,
          source_type: session.sourceType,
          status: session.status,
          brand_context: session.brandContext,
          metadata: session.metadata,
          creative_context: session.creativeContext,
          image_analysis: session.imageAnalysis,
          memory_context: session.memoryContext,
        })
        .select()
        .single();

      if (error) {
        throwSupabaseError('prompt session create', error);
      }

      if (data) {
        const session = mapSession(data as SupabaseRow);
        this.messages.set(session.id, []);
        this.assets.set(session.id, []);
        this.generations.set(session.id, []);

        return {
          session,
          messages: [],
          generations: [],
          assets: [],
        };
      }
    }

    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    this.assets.set(session.id, []);
    this.generations.set(session.id, []);

    return {
      session,
      messages: [],
      generations: [],
      assets: [],
    };
  }

  async getSessionDetail(
    sessionId: string,
    userIdInput?: string,
  ): Promise<PromptSessionDetail | null> {
    const userId = resolveUserId(userIdInput);
    const session = await this.getSession(sessionId, userId);

    if (!session) {
      return null;
    }

    const [messages, generations, assets] = await Promise.all([
      this.listMessages(sessionId, userId),
      this.listGenerations(sessionId, userId),
      this.listAssets(sessionId, userId),
    ]);

    return { session, messages, generations, assets };
  }

  async renameSession(input: {
    userId?: string;
    sessionId: string;
    title: string;
  }): Promise<PromptSession | null> {
    const userId = resolveUserId(input.userId);
    const session = await this.getSession(input.sessionId, userId);

    if (!session) {
      return null;
    }

    const displayTitle = displayNameForPromptSession({
      requestedTitle: input.title,
      creativeContext: session.creativeContext,
      imageAnalysis: session.imageAnalysis,
    });

    return this.updateSession(session.id, userId, {
      title: displayTitle,
      metadata: {
        ...session.metadata,
        displayTitle,
        manualTitle: displayTitle,
      },
    });
  }

  async listSessions(input: ListSessionsInput): Promise<PromptSession[]> {
    const userId = resolveUserId(input.userId);

    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        throwSupabaseError('prompt session list', error);
      }

      if (data) {
        return (data as SupabaseRow[]).map(mapSession);
      }
    }

    return [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async analyzeSessionImage(input: AnalyzeSessionImageInput): Promise<{
    session: PromptSession;
    asset: PromptAsset;
    analysis: ImageAnalysis;
    assistantMessage: PromptMessage;
  } | null> {
    const userId = resolveUserId(input.userId);
    const session = await this.getSession(input.sessionId, userId);

    if (!session) {
      return null;
    }

    const asset = await this.storeAsset(session, input.image, {
      assetRole: 'primary_reference',
      source: 'prompt_generator_primary_reference',
    });
    const analysis = await imageAnalysisService.analyzeImage({
      image: input.image,
      promptText: input.promptText,
      brandContext: session.brandContext,
      memoryContext: session.memoryContext,
    });
    const analysisContext = imageAnalysisToContext(analysis);
    const creativeContext = mergeCreativeContext(session.creativeContext, analysisContext);
    const refreshedMemory = await this.findRelevantMemory(
      userId,
      creativeContext,
      session.brandContext,
    );
    const nextSession = await this.updateSession(session.id, userId, {
      sourceType: session.sourceType === 'text' ? 'mixed' : 'image',
      status: 'active',
      title: displayNameForPromptSession({
        requestedTitle: session.title,
        creativeContext,
        imageAnalysis: analysis,
      }),
      creativeContext,
      imageAnalysis: analysis,
      memoryContext: refreshedMemory,
      metadata: {
        ...session.metadata,
        latestAssetId: asset.id,
        latestImageFileName: asset.fileName,
      },
    });
    const assistantMessage = await this.addMessage({
      sessionId: session.id,
      userId,
      role: 'assistant',
      content: createAnalysisMessage(analysis),
      contentJson: {
        type: 'image_analysis',
        imageAnalysis: analysis,
        creativeContext,
      },
      metadata: {
        assetId: asset.id,
      },
    });

    return {
      session: nextSession,
      asset,
      analysis,
      assistantMessage,
    };
  }

  async sendMessage(input: SendMessageInput): Promise<{
    session: PromptSession;
    userMessage: PromptMessage;
    assistantMessage: PromptMessage;
  } | null> {
    const userId = resolveUserId(input.userId);
    const session = await this.getSession(input.sessionId, userId);

    if (!session) {
      return null;
    }

    const latestGeneration = (await this.listGenerations(session.id, userId))[0];
    const userMessage = await this.addMessage({
      sessionId: session.id,
      userId,
      role: 'user',
      content: input.content,
      contentJson: {
        creativeContextBefore: session.creativeContext,
        latestGeneratedJsonBefore: latestGeneration?.generatedJson,
      },
      metadata: {},
    });
    const messages = await this.listMessages(session.id, userId);
    const assistantResult = await chatAssistantService.createAssistantResponse({
      userMessage: input.content,
      currentContext: session.creativeContext,
      imageAnalysis: session.imageAnalysis,
      brandContext: session.brandContext,
      memoryContext: session.memoryContext,
      messages,
      latestGeneratedJson: latestGeneration?.generatedJson,
    });
    const refreshedMemory = await this.findRelevantMemory(
      userId,
      assistantResult.updatedContext,
      session.brandContext,
    );
    const nextSession = await this.updateSession(session.id, userId, {
      status: 'active',
      sourceType:
        session.sourceType === 'image'
          ? 'mixed'
          : session.sourceType === 'mixed'
            ? 'mixed'
            : 'text',
      creativeContext: assistantResult.updatedContext,
      memoryContext: refreshedMemory,
      metadata: {
        ...session.metadata,
        lastAssistantModel: assistantResult.modelName,
      },
    });
    const assistantMessage = await this.addMessage({
      sessionId: session.id,
      userId,
      role: 'assistant',
      content: assistantResult.assistantMessage,
      contentJson: {
        creativeContextPatch: assistantResult.contextPatch,
        creativeContext: assistantResult.updatedContext,
        unresolvedQuestions: assistantResult.unresolvedQuestions,
      },
      metadata: {
        modelName: assistantResult.modelName,
      },
    });

    return {
      session: nextSession,
      userMessage,
      assistantMessage,
    };
  }

  async addSessionAsset(input: AddSessionAssetInput): Promise<{
    session: PromptSession;
    asset: PromptAsset;
  } | null> {
    const userId = resolveUserId(input.userId);
    const session = await this.getSession(input.sessionId, userId);

    if (!session) {
      return null;
    }

    const assetRole = input.assetRole?.trim() || 'supporting_reference';
    const asset = await this.storeAsset(session, input.image, {
      assetRole,
      source: 'prompt_generator_supporting_asset',
    });
    const nextSession = await this.updateSession(session.id, userId, {
      sourceType: session.sourceType === 'text' ? 'mixed' : session.sourceType,
      status: 'active',
      metadata: {
        ...session.metadata,
        supportingAssetIds: [
          ...(Array.isArray(session.metadata.supportingAssetIds)
            ? session.metadata.supportingAssetIds
            : []),
          asset.id,
        ],
      },
    });

    return {
      session: nextSession,
      asset,
    };
  }

  async generateSessionJson(input: GenerateSessionJsonInput): Promise<{
    session: PromptSession;
    generation: PromptGeneration;
  } | null> {
    const userId = resolveUserId(input.userId);
    const session = await this.getSession(input.sessionId, userId);

    if (!session) {
      return null;
    }

    const messages = await this.listMessages(session.id, userId);
    const assets = await this.listAssets(session.id, userId);
    const primaryAsset =
      assets.find((asset) => asset.metadata.assetRole === 'primary_reference') ??
      assets.find(
        (asset) =>
          asset.metadata.source === 'prompt_generator_upload' &&
          asset.metadata.assetRole === undefined,
      ) ??
      assets[0];
    const referenceAssets = primaryAsset
      ? [primaryAsset, ...assets.filter((asset) => asset.id !== primaryAsset.id)]
      : [];
    const generated = await jsonGenerationService.generateJson({
      session,
      messages,
      outputOptions: input.outputOptions,
    });
    const generation = await this.saveGeneration({
      session,
      generatedJson: generated.generatedJson,
      promptText: generated.promptText,
      promptMetadata: {
        ...generated.promptMetadata,
        creativeContextSnapshot: session.creativeContext,
        conversationSnapshot: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
      },
      modelName: generated.modelName,
      aspectRatio: generated.aspectRatio,
      quality: generated.quality,
      imageCount: generated.imageCount,
      referenceAssets,
    });
    const generationTitle = displayNameForPromptSession({
      requestedTitle: session.title,
      generatedJson: generation.generatedJson,
      promptMetadata: generation.promptMetadata,
      creativeContext: session.creativeContext,
      imageAnalysis: session.imageAnalysis,
    });
    const nextSession = await this.updateSession(session.id, userId, {
      status: 'generated',
      title: generationTitle,
      lastGeneratedAt: generation.createdAt,
      metadata: {
        ...session.metadata,
        displayTitle: generationTitle,
        latestGenerationId: generation.id,
        latestGenerationVersion: generation.versionNumber,
      },
    });

    return {
      session: nextSession,
      generation,
    };
  }

  async generateOneOffJson(input: {
    userId?: string;
    promptText?: string;
    image?: PromptUploadedImage;
    outputOptions?: PromptOutputOptions;
  }) {
    const detail = await this.createSession({
      userId: input.userId,
      sourceType: input.image ? 'image' : 'text',
      title: displayNameForPromptSession({ requestedTitle: input.promptText }),
    });

    if (input.image) {
      await this.analyzeSessionImage({
        userId: detail.session.userId,
        sessionId: detail.session.id,
        image: input.image,
        promptText: input.promptText,
      });
    }

    if (input.promptText?.trim()) {
      await this.sendMessage({
        userId: detail.session.userId,
        sessionId: detail.session.id,
        content: input.promptText,
      });
    }

    return this.generateSessionJson({
      userId: detail.session.userId,
      sessionId: detail.session.id,
      outputOptions: input.outputOptions,
    });
  }

  async enhancePrompt(input: { userId?: string; sessionId?: string; content: string }) {
    if (!input.sessionId) {
      const detail = await this.createSession({
        userId: input.userId,
        sourceType: 'text',
        title: displayNameForPromptSession({ requestedTitle: input.content }),
      });
      return this.sendMessage({
        userId: detail.session.userId,
        sessionId: detail.session.id,
        content: input.content,
      });
    }

    return this.sendMessage({
      userId: input.userId,
      sessionId: input.sessionId,
      content: input.content,
    });
  }

  private async getSession(sessionId: string, userId: string): Promise<PromptSession | null> {
    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throwSupabaseError('prompt session fetch', error);
      }

      if (data) {
        return mapSession(data as SupabaseRow);
      }

      return null;
    }

    const session = this.sessions.get(sessionId);
    return session && session.userId === userId ? session : null;
  }

  private async updateSession(
    sessionId: string,
    userId: string,
    patch: Partial<
      Pick<
        PromptSession,
        | 'title'
        | 'sourceType'
        | 'status'
        | 'metadata'
        | 'creativeContext'
        | 'imageAnalysis'
        | 'memoryContext'
        | 'lastGeneratedAt'
      >
    >,
  ): Promise<PromptSession> {
    const current = await this.getSession(sessionId, userId);
    const updatedAt = nowIso();
    const nextSession: PromptSession = {
      ...(current as PromptSession),
      ...patch,
      updatedAt,
    };

    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_sessions')
        .update({
          title: nextSession.title,
          source_type: nextSession.sourceType,
          status: nextSession.status,
          metadata: nextSession.metadata,
          creative_context: nextSession.creativeContext,
          image_analysis: nextSession.imageAnalysis,
          memory_context: nextSession.memoryContext,
          last_generated_at: nextSession.lastGeneratedAt,
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throwSupabaseError('prompt session update', error);
      }

      if (data) {
        return mapSession(data as SupabaseRow);
      }
    }

    this.sessions.set(sessionId, nextSession);
    return nextSession;
  }

  private async addMessage(input: {
    sessionId: string;
    userId: string;
    role: PromptMessageRole;
    content: string;
    contentJson: JsonObject;
    metadata: JsonObject;
  }): Promise<PromptMessage> {
    const createdAt = nowIso();
    const message: PromptMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      userId: input.userId,
      role: input.role,
      content: input.content,
      contentJson: input.contentJson,
      metadata: input.metadata,
      createdAt,
    };

    if (shouldUseRemote(input.userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_messages')
        .insert({
          id: message.id,
          session_id: input.sessionId,
          user_id: input.userId,
          role: input.role,
          content: input.content,
          content_json: input.contentJson,
          metadata: input.metadata,
        })
        .select()
        .single();

      if (error) {
        throwSupabaseError('prompt message create', error);
      }

      if (data) {
        return mapMessage(data as SupabaseRow);
      }
    }

    const messages = this.messages.get(input.sessionId) ?? [];
    messages.push(message);
    this.messages.set(input.sessionId, messages);

    return message;
  }

  private async listMessages(sessionId: string, userId: string): Promise<PromptMessage[]> {
    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        throwSupabaseError('prompt message list', error);
      }

      if (data) {
        return (data as SupabaseRow[]).map(mapMessage);
      }
    }

    return (this.messages.get(sessionId) ?? []).filter((message) => message.userId === userId);
  }

  private async createReferenceImageUrl(storagePath: string): Promise<string | undefined> {
    if (!supabaseClient) {
      return undefined;
    }

    const { data, error } = await supabaseClient.storage
      .from(promptAssetBucket)
      .createSignedUrl(storagePath, signedReferenceImageTtlSeconds);

    if (error) {
      throwSupabaseError('reference image signed URL create', error);
    }

    return data?.signedUrl;
  }

  private async attachReferenceImageUrl(asset: PromptAsset): Promise<PromptAsset> {
    if (!shouldUseRemote(asset.userId) || asset.url) {
      return asset;
    }

    return {
      ...asset,
      url: await this.createReferenceImageUrl(asset.storagePath),
    };
  }

  private async storeAsset(
    session: PromptSession,
    image: PromptUploadedImage,
    options: { assetRole?: string; source?: string } = {},
  ): Promise<PromptAsset> {
    const createdAt = nowIso();
    const safeFileName = sanitizeFileName(image.fileName);
    const storagePath = `${session.userId}/${session.id}/${Date.now()}-${safeFileName}`;
    let referenceImageUrl: string | undefined = image.dataUrl;
    let cpanelUploadMetadata: JsonObject = {
      cpanelFilename: safeFileName,
      cpanelType: 'reference',
    };

    if (shouldUseRemote(session.userId) && supabaseClient) {
      const decoded = decodeDataUrl(image.dataUrl);

      if (!decoded) {
        throw new HttpError(400, 'image.dataUrl must be a valid data URL.');
      }

      try {
        const isSupporting = options.assetRole === 'supporting_reference';
        const uploadResponse = isSupporting
          ? await cpanelAssetService.uploadSupportingImage({
              buffer: decoded.buffer,
              fileName: safeFileName,
              mimeType: image.mimeType || decoded.mimeType,
              subfolder: session.id.slice(0, 8),
            })
          : await cpanelAssetService.uploadImage({
              buffer: decoded.buffer,
              fileName: safeFileName,
              mimeType: image.mimeType || decoded.mimeType,
              type: 'reference',
            });

        if (uploadResponse.url) {
          referenceImageUrl = uploadResponse.url;
        } else {
          throw new HttpError(502, 'Failed to upload to cpanel: missing uploaded image URL');
        }

        cpanelUploadMetadata = {
          cpanelFilename: uploadResponse.filename,
          cpanelSubfolder: uploadResponse.subfolder,
          cpanelType: isSupporting ? 'reference' : 'reference',
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new HttpError(502, `CPanel upload request failed: ${message}`);
      }
    }

    const asset: PromptAsset = {
      id: randomUUID(),
      sessionId: session.id,
      userId: session.userId,
      bucketName: promptAssetBucket,
      storagePath,
      fileName: image.fileName,
      mimeType: image.mimeType,
      fileSize: image.size,
      url: referenceImageUrl,
      cpanelFilename:
        typeof cpanelUploadMetadata.cpanelFilename === 'string'
          ? cpanelUploadMetadata.cpanelFilename
          : undefined,
      cpanelSubfolder:
        typeof cpanelUploadMetadata.cpanelSubfolder === 'string'
          ? cpanelUploadMetadata.cpanelSubfolder
          : undefined,
      cpanelType: 'reference',
      metadata: {
        source: options.source ?? 'prompt_generator_upload',
        assetRole: options.assetRole ?? 'primary_reference',
        ...cpanelUploadMetadata,
        referenceImageUrl,
      },
      createdAt,
      updatedAt: createdAt,
    };

    if (shouldUseRemote(session.userId) && supabaseClient) {
      const legacyRow = {
        id: asset.id,
        session_id: session.id,
        user_id: session.userId,
        bucket_name: promptAssetBucket,
        storage_path: storagePath,
        file_name: image.fileName,
        mime_type: image.mimeType,
        file_size: image.size,
        reference_image_url: referenceImageUrl,
        metadata: asset.metadata,
      };
      const { data, error } = await supabaseClient
        .from('prompt_assets')
        .insert({
          ...legacyRow,
          cpanel_type: 'reference',
          cpanel_subfolder: asset.cpanelSubfolder,
          cpanel_filename: asset.cpanelFilename,
        })
        .select()
        .single();

      if (error) {
        if (isMissingPromptAssetCpanelColumn(error)) {
          const { data: legacyData, error: legacyError } = await supabaseClient
            .from('prompt_assets')
            .insert(legacyRow)
            .select()
            .single();

          if (legacyError) {
            throwSupabaseError('prompt asset create', legacyError);
          }

          if (legacyData) {
            return {
              ...mapAsset(legacyData as SupabaseRow),
              url: referenceImageUrl,
            };
          }
        }

        throwSupabaseError('prompt asset create', error);
      }

      if (data) {
        return {
          ...mapAsset(data as SupabaseRow),
          url: referenceImageUrl,
        };
      }
    }

    const assets = this.assets.get(session.id) ?? [];
    assets.push(asset);
    this.assets.set(session.id, assets);

    return asset;
  }

  private async listAssets(sessionId: string, userId: string): Promise<PromptAsset[]> {
    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_assets')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throwSupabaseError('prompt asset list', error);
      }

      if (data) {
        return Promise.all(
          (data as SupabaseRow[]).map((row) => this.attachReferenceImageUrl(mapAsset(row))),
        );
      }
    }

    return (this.assets.get(sessionId) ?? []).filter((asset) => asset.userId === userId);
  }

  public async listAllGenerations(input: { userId?: string }): Promise<PromptGeneration[]> {
    const userId = resolveUserId(input.userId);
    const accessibleUserIds = userScopeIds(input.userId);

    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_generations')
        .select('*')
        .in('user_id', accessibleUserIds)
        .order('created_at', { ascending: false });

      if (error) {
        throwSupabaseError('prompt generation list', error);
      }

      if (data) {
        return (data as SupabaseRow[]).map(mapGeneration);
      }
    }

    const allGenerations: PromptGeneration[] = [];
    this.generations.forEach((generations) => {
      generations.forEach((generation) => {
        if (accessibleUserIds.includes(generation.userId)) {
          allGenerations.push(generation);
        }
      });
    });

    return allGenerations.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public async getGenerationById(
    generationId: string,
    userIdInput?: string,
  ): Promise<PromptGeneration | null> {
    const userId = resolveUserId(userIdInput);
    const accessibleUserIds = userScopeIds(userIdInput);

    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_generations')
        .select('*')
        .eq('id', generationId)
        .in('user_id', accessibleUserIds)
        .maybeSingle();

      if (error) {
        throwSupabaseError('prompt generation fetch', error);
      }

      return data ? mapGeneration(data as SupabaseRow) : null;
    }

    for (const generations of this.generations.values()) {
      const generation = generations.find(
        (item) => item.id === generationId && accessibleUserIds.includes(item.userId),
      );

      if (generation) {
        return generation;
      }
    }

    return null;
  }

  private async listGenerations(sessionId: string, userId: string): Promise<PromptGeneration[]> {
    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_generations')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throwSupabaseError('prompt generation list', error);
      }

      if (data) {
        return (data as SupabaseRow[]).map(mapGeneration);
      }
    }

    return (this.generations.get(sessionId) ?? []).filter(
      (generation) => generation.userId === userId,
    );
  }

  private async saveGeneration(input: {
    session: PromptSession;
    generatedJson: JsonObject;
    promptText: string;
    promptMetadata: JsonObject;
    modelName: string;
    aspectRatio: string;
    quality: string;
    imageCount: number;
    referenceAssets: PromptAsset[];
  }): Promise<PromptGeneration> {
    const existing = await this.listGenerations(input.session.id, input.session.userId);
    const createdAt = nowIso();
    const generatedJsonWithReferences = withReferenceImages(
      input.generatedJson,
      input.referenceAssets,
    );
    const referenceImages = referenceImagesForJson(input.referenceAssets);
    const referenceImage = referenceImages[0];
    const primaryAsset = input.referenceAssets[0];
    const displayTitle = displayNameFromPromptContext({
      sessionTitle: input.session.title,
      generatedJson: generatedJsonWithReferences,
      promptMetadata: input.promptMetadata,
      creativeContext: input.session.creativeContext,
      imageAnalysis: input.session.imageAnalysis,
    });
    const generatedJson: JsonObject = {
      ...generatedJsonWithReferences,
      title: displayTitle,
    };
    const promptMetadata: JsonObject = {
      ...input.promptMetadata,
      displayTitle,
      ...(referenceImage ? { referenceImage } : {}),
      ...(referenceImages.length ? { referenceImages } : {}),
    };
    const generation: PromptGeneration = {
      id: randomUUID(),
      sessionId: input.session.id,
      userId: input.session.userId,
      versionNumber: existing.length + 1,
      promptText: input.promptText,
      generatedJson,
      promptMetadata,
      imageInsights: input.session.imageAnalysis,
      referenceImagePath: primaryAsset?.storagePath,
      referenceImageUrl: primaryAsset?.url,
      modelName: input.modelName,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      imageCount: input.imageCount,
      status: 'completed',
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
    };

    if (shouldUseRemote(input.session.userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_generations')
        .insert({
          id: generation.id,
          session_id: input.session.id,
          user_id: input.session.userId,
          version_number: generation.versionNumber,
          prompt_text: generation.promptText,
          generated_json: generation.generatedJson,
          prompt_metadata: generation.promptMetadata,
          image_insights: generation.imageInsights,
          reference_image_path: generation.referenceImagePath,
          reference_image_url: generation.referenceImageUrl,
          model_name: generation.modelName,
          aspect_ratio: generation.aspectRatio,
          quality: generation.quality,
          image_count: generation.imageCount,
          status: generation.status,
          creative_context_snapshot: input.session.creativeContext,
          conversation_snapshot: promptMetadata.conversationSnapshot ?? [],
        })
        .select()
        .single();

      if (error) {
        throwSupabaseError('prompt generation create', error);
      }

      if (data) {
        return mapGeneration(data as SupabaseRow);
      }
    }

    const generations = this.generations.get(input.session.id) ?? [];
    generations.push(generation);
    this.generations.set(input.session.id, generations);

    return generation;
  }

  private async findRelevantMemory(
    userId: string,
    context: CreativeContext,
    brandContext: JsonObject,
  ): Promise<PromptMemoryItem[]> {
    const localItems: PromptMemoryItem[] = [];

    if (shouldUseRemote(userId) && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('prompt_generations')
        .select('id, session_id, generated_json, prompt_metadata, created_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        throwSupabaseError('prompt memory list', error);
      }

      if (data) {
        return (data as SupabaseRow[])
          .map((row) => {
            const metadata = asJsonObject(row.prompt_metadata);
            const creativeContext = asCreativeContext(metadata.creativeContextSnapshot);
            const item: PromptMemoryItem = {
              sessionId: asString(row.session_id),
              title: asString(metadata.title, 'Previous generated prompt'),
              reason: 'Previously generated JSON prompt',
              creativeContext,
              generatedJson: asJsonObject(row.generated_json),
              createdAt: asString(row.created_at),
              brandName: brandContext.name,
            };
            return item;
          })
          .map((item) => ({
            item,
            score: scoreMemoryItem(item, context, brandContext),
          }))
          .filter(({ score }) => score > 0 || Object.keys(context).length === 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 5)
          .map(({ item, score }) => ({
            ...item,
            reason: score > 0 ? `Matched prior creative context with score ${score}` : item.reason,
          }));
      }
    }

    this.generations.forEach((generations) => {
      generations.forEach((generation) => {
        if (generation.userId !== userId || generation.status !== 'completed') {
          return;
        }

        const snapshot = asCreativeContext(generation.promptMetadata.creativeContextSnapshot);
        localItems.push({
          sessionId: generation.sessionId,
          title: asString(generation.promptMetadata.title, 'Previous generated prompt'),
          reason: 'Previously generated JSON prompt',
          creativeContext: snapshot,
          generatedJson: generation.generatedJson,
          createdAt: generation.createdAt,
          brandName: brandContext.name,
        });
      });
    });

    return localItems
      .map((item) => ({
        item,
        score: scoreMemoryItem(item, context, brandContext),
      }))
      .filter(({ score }) => score > 0 || Object.keys(context).length === 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map(({ item, score }) => ({
        ...item,
        reason: score > 0 ? `Matched prior creative context with score ${score}` : item.reason,
      }));
  }
}

export const promptService = new PromptService();
