import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const analyticsController = {
  summary: (_request: Request, response: Response) => sendPlaceholder(response, 'Analytics summary'),
};

