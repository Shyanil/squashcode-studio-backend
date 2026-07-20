import { Router } from 'express';

import { assetsController } from '@/controllers/assets.controller';
import { uploadSingleAsset } from '@/middleware/upload.middleware';

export const assetsRouter = Router();

assetsRouter.get('/', assetsController.list);
assetsRouter.post('/upload', uploadSingleAsset, assetsController.upload);

