import type { NextFunction, Request, Response } from 'express';

import type { JwtUser } from '@/auth/auth.types';

export interface AuthenticatedRequest extends Request {
  auth?: JwtUser;
}

export function authenticateJwt(_request: Request, _response: Response, next: NextFunction) {
  // Placeholder for JWT validation and request user attachment.
  next();
}

