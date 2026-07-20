import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '@/auth/roles';

export function authorizeRoles(..._roles: UserRole[]) {
  return (_request: Request, _response: Response, next: NextFunction) => {
    // Placeholder for role-based authorization.
    next();
  };
}

