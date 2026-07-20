import { notImplemented } from '@/utils/httpError';

export class SupabaseStorageService {
  accessStorage() {
    return notImplemented('Supabase Storage access');
  }
}

export const supabaseStorageService = new SupabaseStorageService();

