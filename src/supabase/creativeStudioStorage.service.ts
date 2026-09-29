import { CREATIVE_STUDIO_STORAGE_BUCKET } from '@/config/creativeStudioStorage';
import { env } from '@/config/env';
import { supabaseAdminClient } from '@/supabase/client';
import { HttpError } from '@/utils/httpError';

const legacyCpanelPublicOrigin = 'https://api.squashcode-studio.7sc.in';
const legacyCpanelAssetHosts = new Set([
  'api.squashcode-studio.7sc.in',
  'squashcode-studio.7sc.in',
  'www.squashcode-studio.7sc.in',
]);

export interface CreativeStudioUploadResult {
  bucket: string;
  fileName: string;
  storagePath: string;
  url: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function supabaseProjectRefFromUrl(supabaseUrl: string) {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    return hostname.split('.')[0];
  } catch {
    return undefined;
  }
}

export function isSupabaseStoragePublicUrl(value?: string) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.pathname.includes('/storage/v1/object/public/') &&
      url.pathname.includes(`/${CREATIVE_STUDIO_STORAGE_BUCKET}/`)
    );
  } catch {
    return false;
  }
}

/** Normalize legacy cPanel URLs and pass through Supabase / data URLs. */
export function normalizeCreativeAssetUrl(value?: string) {
  const rawValue = asString(value);

  if (!rawValue || rawValue.startsWith('data:')) {
    return rawValue;
  }

  if (isSupabaseStoragePublicUrl(rawValue)) {
    return rawValue;
  }

  if (rawValue.startsWith('//')) {
    return normalizeCreativeAssetUrl(`https:${rawValue}`);
  }

  try {
    const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(rawValue);
    const url = new URL(rawValue, legacyCpanelPublicOrigin);

    if (!isAbsolute || legacyCpanelAssetHosts.has(url.hostname)) {
      url.protocol = 'https:';
      url.hostname = 'api.squashcode-studio.7sc.in';
      url.port = '';
      return url.toString();
    }

    return rawValue;
  } catch {
    return rawValue;
  }
}

export function parseStorageLocationFromUrl(url: string):
  | { bucket: string; storagePath: string }
  | undefined {
  if (!url || url.startsWith('data:')) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/';
    const markerIndex = parsed.pathname.indexOf(marker);

    if (markerIndex < 0) {
      return undefined;
    }

    const remainder = parsed.pathname.slice(markerIndex + marker.length);
    const slashIndex = remainder.indexOf('/');

    if (slashIndex < 0) {
      return undefined;
    }

    const bucket = decodeURIComponent(remainder.slice(0, slashIndex));
    const storagePath = decodeURIComponent(remainder.slice(slashIndex + 1));

    if (!bucket || !storagePath) {
      return undefined;
    }

    return { bucket, storagePath };
  } catch {
    return undefined;
  }
}

export function publicUrlForStoragePath(storagePath: string, bucket = CREATIVE_STUDIO_STORAGE_BUCKET) {
  const baseUrl = env.supabaseUrl.replace(/\/$/, '');
  const encodedPath = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${baseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

export class CreativeStudioStorageService {
  private client() {
    if (!supabaseAdminClient) {
      throw new HttpError(503, 'Supabase is not configured for storage uploads.');
    }

    return supabaseAdminClient;
  }

  async uploadImage(input: {
    buffer: Buffer;
    storagePath: string;
    mimeType: string;
    bucket?: string;
    upsert?: boolean;
  }): Promise<CreativeStudioUploadResult> {
    const bucket = input.bucket ?? CREATIVE_STUDIO_STORAGE_BUCKET;
    const fileName = input.storagePath.split('/').pop() ?? 'image.png';

    const { error } = await this.client().storage.from(bucket).upload(input.storagePath, input.buffer, {
      contentType: input.mimeType,
      upsert: input.upsert ?? false,
    });

    if (error) {
      throw new HttpError(502, `Supabase Storage upload failed: ${error.message}`);
    }

    const url = publicUrlForStoragePath(input.storagePath, bucket);

    return {
      bucket,
      fileName,
      storagePath: input.storagePath,
      url,
    };
  }

  async deleteObject(input: { storagePath: string; bucket?: string }) {
    const bucket = input.bucket ?? CREATIVE_STUDIO_STORAGE_BUCKET;
    const { error } = await this.client().storage.from(bucket).remove([input.storagePath]);

    if (error) {
      throw new HttpError(502, `Supabase Storage delete failed: ${error.message}`);
    }
  }

  async deleteObjectsByPrefix(input: { prefix: string; bucket?: string }) {
    const bucket = input.bucket ?? CREATIVE_STUDIO_STORAGE_BUCKET;
    const client = this.client().storage.from(bucket);
    const prefix = input.prefix.replace(/\/$/, '');
    const paths: string[] = [];
    const pageSize = 100;
    let offset = 0;

    for (;;) {
      const { data, error } = await client.list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) {
        throw new HttpError(502, `Supabase Storage list failed: ${error.message}`);
      }

      if (!data?.length) {
        break;
      }

      for (const item of data) {
        if (item.id) {
          paths.push(`${prefix}/${item.name}`);
        }
      }

      if (data.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    if (!paths.length) {
      return;
    }

    const { error: removeError } = await client.remove(paths);

    if (removeError) {
      throw new HttpError(502, `Supabase Storage bulk delete failed: ${removeError.message}`);
    }
  }
}

export const creativeStudioStorageService = new CreativeStudioStorageService();

export function supabaseStorageConfigured() {
  return Boolean(env.supabaseUrl && supabaseAdminClient);
}

export { supabaseProjectRefFromUrl };
