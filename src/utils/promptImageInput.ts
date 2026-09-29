import axios from 'axios';

import type { PromptUploadedImage } from '@/models/prompt.model';
import { HttpError } from '@/utils/httpError';

const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const extensionMime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function fileNameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : 'reference-image';
  } catch {
    return 'reference-image';
  }
}

function mimeFromFileName(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension && extensionMime[extension]) {
    return extensionMime[extension];
  }

  return undefined;
}

function assertAllowedMime(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(';')[0];

  if (!allowedMimeTypes.has(normalized)) {
    throw new HttpError(400, 'Only PNG, JPG, and WebP images are supported.');
  }

  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

async function downloadImageUrl(imageUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new HttpError(400, 'imageUrl must be a valid http or https URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'imageUrl must use http or https.');
  }

  const response = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: 'arraybuffer',
    maxContentLength: 25 * 1024 * 1024,
    maxBodyLength: 25 * 1024 * 1024,
    timeout: 30_000,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const fileName = fileNameFromUrl(imageUrl);
  const headerType =
    typeof response.headers['content-type'] === 'string'
      ? response.headers['content-type'].split(';')[0]
      : undefined;
  const headerMime = headerType?.toLowerCase().split(';')[0];
  const extensionMimeType = mimeFromFileName(fileName);
  const mimeType = assertAllowedMime(
    headerMime && allowedMimeTypes.has(headerMime)
      ? headerMime
      : extensionMimeType ??
        (headerMime === 'application/octet-stream' ? 'image/jpeg' : undefined) ??
        'image/png',
  );
  const buffer = Buffer.from(response.data);
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

  return {
    dataUrl,
    fileName,
    mimeType,
    size: buffer.length,
  };
}

export async function resolvePromptUploadedImage(value: unknown): Promise<PromptUploadedImage> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'image is required.');
  }

  const record = value as Record<string, unknown>;
  const imageUrl = asString(record.imageUrl) ?? asString(record.url) ?? asString(record.link);
  const dataUrl = asString(record.dataUrl);

  if (imageUrl && !dataUrl) {
    return downloadImageUrl(imageUrl);
  }

  const fileName = asString(record.fileName);
  const mimeType = asString(record.mimeType);

  if (!dataUrl || !fileName) {
    throw new HttpError(
      400,
      'Provide image.dataUrl with fileName and mimeType, or image.imageUrl for a PNG, JPG, or WebP link.',
    );
  }

  const resolvedMime =
    mimeType && mimeType !== 'image/*'
      ? mimeType
      : mimeFromFileName(fileName) ?? 'image/png';

  return {
    dataUrl,
    fileName,
    mimeType: assertAllowedMime(resolvedMime),
    size: typeof record.size === 'number' ? record.size : undefined,
  };
}
