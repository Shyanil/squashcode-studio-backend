import { Router } from 'express';

import { promptJsonFoldersController } from '@/controllers/promptJsonFolders.controller';

export const promptJsonFoldersRouter = Router();

promptJsonFoldersRouter.get('/', promptJsonFoldersController.list);
promptJsonFoldersRouter.post('/', promptJsonFoldersController.create);
promptJsonFoldersRouter.delete('/:id', promptJsonFoldersController.delete);
promptJsonFoldersRouter.patch(
  '/generations/:generationId',
  promptJsonFoldersController.assignGeneration,
);
