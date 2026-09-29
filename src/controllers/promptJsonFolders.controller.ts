import type { Request, Response } from 'express';

import { promptJsonFoldersService } from '@/services/promptJsonFolders.service';
import { asyncHandler } from '@/utils/asyncHandler';

function requestUserId(request: Request) {
  return request.header('x-user-id') ?? undefined;
}

function requestBody(request: Request): Record<string, unknown> {
  return typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body)
    ? (request.body as Record<string, unknown>)
    : {};
}

export const promptJsonFoldersController = {
  list: asyncHandler(async (_request: Request, response: Response) => {
    const data = await promptJsonFoldersService.listFolders();
    response.status(200).json({ data });
  }),

  create: asyncHandler(async (request: Request, response: Response) => {
    const body = requestBody(request);
    const data = await promptJsonFoldersService.createFolder({
      userId: requestUserId(request),
      name: body.name,
      description: body.description,
      color: body.color,
    });

    response.status(201).json({ data });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    await promptJsonFoldersService.deleteFolder(request.params.id);
    response.status(200).json({ data: true });
  }),

  assignGeneration: asyncHandler(async (request: Request, response: Response) => {
    const body = requestBody(request);
    const rawFolderId = body.folderId ?? body.folder_id;
    const folderId =
      rawFolderId === null || rawFolderId === ''
        ? null
        : typeof rawFolderId === 'string'
          ? rawFolderId
          : undefined;

    await promptJsonFoldersService.assignGeneration({
      generationId: request.params.generationId,
      folderId,
    });

    response.status(200).json({ data: true });
  }),
};
