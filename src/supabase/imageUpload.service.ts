import { creativeStudioStorageService } from '@/supabase/creativeStudioStorage.service';

export class SupabaseImageUploadService {
  uploadImage(input: {
    buffer: Buffer;
    storagePath: string;
    mimeType: string;
    bucket?: string;
    upsert?: boolean;
  }) {
    return creativeStudioStorageService.uploadImage(input);
  }
}

export const supabaseImageUploadService = new SupabaseImageUploadService();
