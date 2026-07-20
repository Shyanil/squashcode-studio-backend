import type { UserRole } from '@/auth/roles';

export interface JwtUser {
  email?: string;
  role: UserRole;
  sub: string;
}

