import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const historyController = {
  list: (_request: Request, response: Response) => sendPlaceholder(response, 'History list'),
};

