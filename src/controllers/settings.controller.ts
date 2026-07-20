import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const settingsController = {
  get: (_request: Request, response: Response) => sendPlaceholder(response, 'Settings'),
};

