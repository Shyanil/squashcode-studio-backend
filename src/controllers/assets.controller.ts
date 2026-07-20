import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const assetsController = {
  list: (_request: Request, response: Response) => sendPlaceholder(response, 'Assets list'),
  upload: (_request: Request, response: Response) => sendPlaceholder(response, 'Asset upload'),
};

