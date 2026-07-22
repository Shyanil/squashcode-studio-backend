import { Router } from 'express';

import { creativeController } from '@/controllers/creative.controller';

export const creativeRouter = Router();

creativeRouter.get('/', creativeController.list);
creativeRouter.post('/generate', creativeController.generate);
creativeRouter.post('/:id/feedback', creativeController.createFeedback);
creativeRouter.post('/:id/metrics', creativeController.recordMetrics);
creativeRouter.get('/:id/learning-summary', creativeController.learningSummary);
creativeRouter.post('/:id/favorite', creativeController.toggleFavorite);
creativeRouter.delete('/:id', creativeController.delete);
