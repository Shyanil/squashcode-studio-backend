import { Router } from 'express';

import { creativeController } from '@/controllers/creative.controller';

export const creativeRouter = Router();

creativeRouter.get('/', creativeController.list);
creativeRouter.post('/generate', creativeController.generate);
creativeRouter.delete('/:id', creativeController.delete);
creativeRouter.post('/:id/favorite', creativeController.toggleFavorite);
