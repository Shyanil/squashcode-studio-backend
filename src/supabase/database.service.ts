import { notImplemented } from '@/utils/httpError';

export class SupabaseDatabaseService {
  query() {
    return notImplemented('Supabase database access');
  }
}

export const supabaseDatabaseService = new SupabaseDatabaseService();

