import { notImplemented } from '@/utils/httpError';

export class SupabaseImageUploadService {
  uploadImage() {
    return notImplemented('Supabase image upload');
  }
}

export const supabaseImageUploadService = new SupabaseImageUploadService();

