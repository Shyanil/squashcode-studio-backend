import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const usersController = {
  list: (_request: Request, response: Response) => sendPlaceholder(response, 'Users list'),
};

