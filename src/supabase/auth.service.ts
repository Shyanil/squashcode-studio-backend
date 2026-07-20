import { notImplemented } from '@/utils/httpError';

export class SupabaseAuthService {
  authenticateUser() {
    return notImplemented('Supabase authentication');
  }
}

export const supabaseAuthService = new SupabaseAuthService();

