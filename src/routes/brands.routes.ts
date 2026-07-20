import { Router } from 'express';

import { brandsController } from '@/controllers/brands.controller';

export const brandsRouter = Router();

brandsRouter.get('/', brandsController.list);

