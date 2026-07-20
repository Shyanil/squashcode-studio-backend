import type { Request, Response } from 'express';

import type { AuthenticatedRequest } from '@/middleware/auth.middleware';
import type {
  JsonObject,
  PromptOutputOptions,
  PromptSourceType,
  PromptUploadedImage,
} from '@/models/prompt.model';
import { promptService } from '@/services/prompt.service';
import { asyncHandler } from '@/utils/asyncHandler';
import { HttpError } from '@/utils/httpError';

function requestUserId(request: Request) {
  const authUserId = (request as AuthenticatedRequest).auth?.sub;
  const headerUserId = request.header('x-user-id');
  return authUserId ?? headerUserId ?? undefined;
}

function jsonBody(request: Request): JsonObject {
  return typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body)
    ? (request.body as JsonObject)
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function asJsonObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asSourceType(value: unknown): PromptSourceType | undefined {
  return value === 'text' || value === 'image' || value === 'mixed' ? value : undefined;
}

function asOutputOptions(value: unknown): PromptOutputOptions | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  return {
    aspectRatio: asString(record.aspectRatio),
    quality: asString(record.quality),
    imageCount: typeof record.imageCount === 'number' ? record.imageCount : undefined,
  };
}

function asUploadedImage(value: unknown): PromptUploadedImage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'image is required.');
  }

  const record = value as Record<string, unknown>;
  const dataUrl = asString(record.dataUrl);
  const fileName = asString(record.fileName);
  const mimeType = asString(record.mimeType);

  if (!dataUrl || !fileName || !mimeType) {
    throw new HttpError(400, 'image.dataUrl, image.fileName, and image.mimeType are required.');
  }

  return {
    dataUrl,
    fileName,
    mimeType,
    size: typeof record.size === 'number' ? record.size : undefined,
  };
}

function requireSessionId(request: Request) {
  const sessionId = request.params.sessionId;

  if (!sessionId) {
    throw new HttpError(400, 'sessionId is required.');
  }

  return sessionId;
}

export const promptController = {
  listSessions: asyncHandler(async (request: Request, response: Response) => {
    const sessions = await promptService.listSessions({
      userId: requestUserId(request),
    });

    response.status(200).json({ data: sessions });
  }),

  listGenerations: asyncHandler(async (request: Request, response: Response) => {
    const generations = await promptService.listAllGenerations({
      userId: requestUserId(request),
    });

    response.status(200).json({ data: generations });
  }),

  createSession: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const detail = await promptService.createSession({
      userId: requestUserId(request),
      title: asString(body.title),
      sourceType: asSourceType(body.sourceType),
      brandContext: asJsonObject(body.brandContext),
      metadata: asJsonObject(body.metadata),
    });

    response.status(201).json({ data: detail });
  }),

  getSession: asyncHandler(async (request: Request, response: Response) => {
    const detail = await promptService.getSessionDetail(
      requireSessionId(request),
      requestUserId(request),
    );

    if (!detail) {
      throw new HttpError(404, 'Prompt session not found.');
    }

    response.status(200).json({ data: detail });
  }),

  analyzeImage: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const result = await promptService.analyzeSessionImage({
      userId: requestUserId(request),
      sessionId: requireSessionId(request),
      image: asUploadedImage(body.image),
      promptText: asString(body.promptText),
    });

    if (!result) {
      throw new HttpError(404, 'Prompt session not found.');
    }

    response.status(200).json({ data: result });
  }),

  addAsset: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const result = await promptService.addSessionAsset({
      userId: requestUserId(request),
      sessionId: requireSessionId(request),
      image: asUploadedImage(body.image),
      assetRole: asString(body.assetRole),
    });

    if (!result) {
      throw new HttpError(404, 'Prompt session not found.');
    }

    response.status(200).json({ data: result });
  }),

  sendMessage: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const content = asString(body.content);

    if (!content?.trim()) {
      throw new HttpError(400, 'content is required.');
    }

    const result = await promptService.sendMessage({
      userId: requestUserId(request),
      sessionId: requireSessionId(request),
      content,
    });

    if (!result) {
      throw new HttpError(404, 'Prompt session not found.');
    }

    response.status(200).json({ data: result });
  }),

  generateSessionJson: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const result = await promptService.generateSessionJson({
      userId: requestUserId(request),
      sessionId: requireSessionId(request),
      outputOptions: asOutputOptions(body.outputOptions),
    });

    if (!result) {
      throw new HttpError(404, 'Prompt session not found.');
    }

    response.status(200).json({ data: result });
  }),

  generateJson: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const sessionId = asString(body.sessionId);
    const result = sessionId
      ? await promptService.generateSessionJson({
          userId: requestUserId(request),
          sessionId,
          outputOptions: asOutputOptions(body.outputOptions),
        })
      : await promptService.generateOneOffJson({
          userId: requestUserId(request),
          promptText: asString(body.promptText),
          image: body.image ? asUploadedImage(body.image) : undefined,
          outputOptions: asOutputOptions(body.outputOptions),
        });

    if (!result) {
      throw new HttpError(404, 'Prompt session not found.');
    }

    response.status(200).json({ data: result });
  }),

  enhance: asyncHandler(async (request: Request, response: Response) => {
    const body = jsonBody(request);
    const content = asString(body.content) ?? asString(body.promptText);

    if (!content?.trim()) {
      throw new HttpError(400, 'content is required.');
    }

    const result = await promptService.enhancePrompt({
      userId: requestUserId(request),
      sessionId: asString(body.sessionId),
      content,
    });

    response.status(200).json({ data: result });
  }),
};
