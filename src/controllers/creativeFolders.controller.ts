import type { Request, Response } from 'express';

import { creativeFoldersService } from '@/services/creativeFolders.service';
import { asyncHandler } from '@/utils/asyncHandler';

function requestUserId(request: Request) {
  return request.header('x-user-id') ?? undefined;
}

function requestBody(request: Request): Record<string, unknown> {
  return typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body)
    ? (request.body as Record<string, unknown>)
    : {};
}

export const creativeFoldersController = {
  list: asyncHandler(async (_request: Request, response: Response) => {
    const data = await creativeFoldersService.listFolders();
    response.status(200).json({ data });
  }),

  create: asyncHandler(async (request: Request, response: Response) => {
    const body = requestBody(request);
    const data = await creativeFoldersService.createFolder({
      userId: requestUserId(request),
      name: body.name,
      description: body.description,
      color: body.color,
    });

    response.status(201).json({ data });
  }),

  update: asyncHandler(async (request: Request, response: Response) => {
    const body = requestBody(request);
    const data = await creativeFoldersService.updateFolder({
      id: request.params.id,
      name: body.name,
      description: body.description,
      color: body.color,
    });

    response.status(200).json({ data });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    await creativeFoldersService.deleteFolder(request.params.id);
    response.status(200).json({ data: true });
  }),
};
