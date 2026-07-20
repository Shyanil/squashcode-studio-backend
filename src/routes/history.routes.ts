import { Router } from 'express';

import { historyController } from '@/controllers/history.controller';

export const historyRouter = Router();

historyRouter.get('/', historyController.list);

