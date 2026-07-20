import { Router } from 'express';

import { templatesController } from '@/controllers/templates.controller';

export const templatesRouter = Router();

templatesRouter.get('/', templatesController.list);

