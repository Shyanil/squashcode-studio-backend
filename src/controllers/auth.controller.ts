import type { Request, Response } from 'express';

import { sendPlaceholder } from '@/utils/apiResponse';

export const authController = {
  login: (_request: Request, response: Response) => sendPlaceholder(response, 'Auth login'),
  logout: (_request: Request, response: Response) => sendPlaceholder(response, 'Auth logout'),
  me: (_request: Request, response: Response) => sendPlaceholder(response, 'Auth profile'),
};

