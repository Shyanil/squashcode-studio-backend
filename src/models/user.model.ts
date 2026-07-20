import type { UserRole } from '@/auth/roles';

export interface UserModel {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: UserRole;
}

