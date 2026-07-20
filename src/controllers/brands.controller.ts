import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const brandsController = {
  list: (_request: Request, response: Response) => sendPlaceholder(response, 'Brands list'),
};

