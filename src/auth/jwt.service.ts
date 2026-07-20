import type { JwtUser } from '@/auth/auth.types';
import { notImplemented } from '@/utils/httpError';

export class JwtService {
  signToken(): string {
    return notImplemented('JWT signing');
  }

  verifyToken(): JwtUser {
    return notImplemented('JWT verification');
  }
}

export const jwtService = new JwtService();

