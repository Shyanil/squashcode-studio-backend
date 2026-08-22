import { Router } from 'express';

import { creativeFoldersController } from '@/controllers/creativeFolders.controller';

export const creativeFoldersRouter = Router();

creativeFoldersRouter.get('/', creativeFoldersController.list);
creativeFoldersRouter.post('/', creativeFoldersController.create);
creativeFoldersRouter.patch('/:id', creativeFoldersController.update);
creativeFoldersRouter.delete('/:id', creativeFoldersController.delete);
