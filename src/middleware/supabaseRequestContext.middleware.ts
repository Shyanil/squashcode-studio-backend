import type { NextFunction, Request, Response } from 'express';

import { runWithSupabaseRequestContext } from '@/supabase/requestContext';

export function bindSupabaseRequestContext(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  runWithSupabaseRequestContext(request.header('authorization'), () => next());
}
