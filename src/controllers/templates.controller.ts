import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const templatesController = {
  list: (_request: Request, response: Response) => sendPlaceholder(response, 'Templates list'),
};

