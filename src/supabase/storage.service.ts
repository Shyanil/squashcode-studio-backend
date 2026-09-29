import {
  creativeStudioStorageService,
  type CreativeStudioUploadResult,
} from '@/supabase/creativeStudioStorage.service';

export type { CreativeStudioUploadResult };

export class SupabaseStorageService {
  uploadImage(input: {
    buffer: Buffer;
    storagePath: string;
    mimeType: string;
    bucket?: string;
    upsert?: boolean;
  }) {
    return creativeStudioStorageService.uploadImage(input);
  }

  deleteObject(input: { storagePath: string; bucket?: string }) {
    return creativeStudioStorageService.deleteObject(input);
  }

  deleteObjectsByPrefix(input: { prefix: string; bucket?: string }) {
    return creativeStudioStorageService.deleteObjectsByPrefix(input);
  }
}

export const supabaseStorageService = new SupabaseStorageService();
