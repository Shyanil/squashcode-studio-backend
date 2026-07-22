import { randomUUID } from 'crypto';
import { deflateSync } from 'zlib';
import axios from 'axios';
import { env } from '@/config/env';
import { supabaseAdminClient, supabaseClient } from '@/supabase/client';
import {
  cpanelAssetService,
  normalizeCpanelAssetUrl,
  type CpanelAssetType,
} from '@/services/cpanelAsset.service';
import { promptService } from '@/services/prompt.service';
import type { JsonObject, PromptGeneration } from '@/models/prompt.model';
import { HttpError } from '@/utils/httpError';
import { displayNameForCreative } from '@/utils/displayName';
import {
  imageGenerationService,
  openAIImageModel,
  type ImageGenerationQuality,
} from '@/openai/imageGeneration.service';

export interface CreativeModel {
  id: string;
  userId: string;
  title: string;
  brand: string;
  campaign: string;
  tags: string[];
  date: string;
  aspectRatio: string;
  variant: string;
  favorite: boolean;
  imageUrl: string;
  createdAt: string;
  cpanelFilename?: string;
  cpanelSubfolder?: string;
  cpanelType?: CpanelAssetType;
  promptGenerationId?: string;
  referenceImageUrl?: string;
}

type CreativeVariant = CreativeModel['variant'];
type Rgb = [number, number, number];
const localCreativeUserId = '00000000-0000-4000-8000-000000000001';

interface FallbackPngInput {
  title: string;
  variant: CreativeVariant;
  size: string;
}

const fallbackPalettes: Record<CreativeVariant, { start: Rgb; end: Rgb; accent: Rgb; shade: Rgb }> =
  {
    coral: {
      start: [244, 92, 67],
      end: [252, 186, 89],
      accent: [255, 255, 255],
      shade: [107, 33, 31],
    },
    mint: {
      start: [23, 180, 142],
      end: [74, 196, 224],
      accent: [236, 253, 245],
      shade: [15, 81, 75],
    },
    indigo: {
      start: [79, 70, 229],
      end: [45, 212, 191],
      accent: [238, 242, 255],
      shade: [30, 41, 59],
    },
    amber: {
      start: [245, 158, 11],
      end: [250, 204, 21],
      accent: [255, 251, 235],
      shade: [120, 53, 15],
    },
    rose: {
      start: [236, 72, 153],
      end: [248, 113, 113],
      accent: [255, 241, 242],
      shade: [136, 19, 55],
    },
    cyan: {
      start: [6, 182, 212],
      end: [59, 130, 246],
      accent: [240, 249, 255],
      shade: [30, 58, 138],
    },
  };

let crcTable: number[] | undefined;

function getCrcTable(): number[] {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }

  return crcTable;
}

function crc32(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixColor(start: Rgb, end: Rgb, amount: number): Rgb {
  const safeAmount = Math.max(0, Math.min(1, amount));
  return [
    clampByte(start[0] + (end[0] - start[0]) * safeAmount),
    clampByte(start[1] + (end[1] - start[1]) * safeAmount),
    clampByte(start[2] + (end[2] - start[2]) * safeAmount),
  ];
}

function blendPixel(buffer: Buffer, offset: number, color: Rgb, alpha: number) {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const inverseAlpha = 1 - safeAlpha;
  buffer[offset] = clampByte(buffer[offset] * inverseAlpha + color[0] * safeAlpha);
  buffer[offset + 1] = clampByte(buffer[offset + 1] * inverseAlpha + color[1] * safeAlpha);
  buffer[offset + 2] = clampByte(buffer[offset + 2] * inverseAlpha + color[2] * safeAlpha);
  buffer[offset + 3] = 255;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function parseImageSize(size: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function drawCircle(
  buffer: Buffer,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: Rgb,
  alpha: number,
) {
  const stride = width * 4 + 1;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance <= radius) {
        const edgeFade = Math.min(1, (radius - distance) / Math.max(1, radius * 0.12));
        const offset = y * stride + 1 + x * 4;
        blendPixel(buffer, offset, color, alpha * edgeFade);
      }
    }
  }
}

function drawRect(
  buffer: Buffer,
  width: number,
  x0: number,
  y0: number,
  rectWidth: number,
  rectHeight: number,
  color: Rgb,
  alpha: number,
) {
  const stride = width * 4 + 1;
  const minX = Math.max(0, Math.floor(x0));
  const maxX = Math.min(width - 1, Math.ceil(x0 + rectWidth));
  const minY = Math.max(0, Math.floor(y0));
  const maxY = Math.ceil(y0 + rectHeight);

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * stride + 1;
    for (let x = minX; x <= maxX; x++) {
      blendPixel(buffer, rowOffset + x * 4, color, alpha);
    }
  }
}

function createPngBuffer(width: number, height: number, pixels: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createFallbackPng(input: FallbackPngInput): Buffer {
  const { width, height } = parseImageSize(input.size);
  const palette = fallbackPalettes[input.variant];
  const seed = hashString(input.title);
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);
  const maxX = Math.max(1, width - 1);
  const maxY = Math.max(1, height - 1);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    pixels[rowOffset] = 0;

    for (let x = 0; x < width; x++) {
      const diagonal = (x / maxX) * 0.58 + (y / maxY) * 0.42;
      const glow = Math.max(0, 1 - Math.hypot(x / width - 0.24, y / height - 0.18) * 1.35);
      const color = mixColor(palette.start, palette.end, diagonal);
      const offset = rowOffset + 1 + x * 4;

      pixels[offset] = clampByte(color[0] + glow * 38);
      pixels[offset + 1] = clampByte(color[1] + glow * 38);
      pixels[offset + 2] = clampByte(color[2] + glow * 38);
      pixels[offset + 3] = 255;
    }
  }

  const drift = (seed % 19) / 100;
  drawCircle(
    pixels,
    width,
    height,
    width * (0.22 + drift),
    height * 0.2,
    Math.min(width, height) * 0.18,
    palette.accent,
    0.2,
  );
  drawCircle(
    pixels,
    width,
    height,
    width * 0.78,
    height * 0.76,
    Math.min(width, height) * 0.25,
    palette.shade,
    0.12,
  );
  drawRect(
    pixels,
    width,
    width * 0.12,
    height * 0.62,
    width * 0.52,
    Math.max(24, height * 0.045),
    palette.accent,
    0.72,
  );
  drawRect(
    pixels,
    width,
    width * 0.12,
    height * 0.69,
    width * 0.36,
    Math.max(18, height * 0.028),
    palette.accent,
    0.42,
  );
  drawRect(
    pixels,
    width,
    width * 0.12,
    height * 0.75,
    width * 0.24,
    Math.max(18, height * 0.028),
    palette.shade,
    0.22,
  );

  return createPngBuffer(width, height, pixels);
}

function imageSizeForAspectRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case '4:5':
      return '1024x1280';
    case '9:16':
      return '864x1536';
    case '16:9':
      return '1536x864';
    case '3:2':
      return '1536x1024';
    case '2:3':
      return '1024x1536';
    case '1:1':
    default:
      return '1024x1024';
  }
}

function imageQualityForSetting(quality: string): ImageGenerationQuality {
  switch (quality) {
    case 'standard':
      return 'medium';
    case 'high':
    case 'ultra':
      return 'high';
    default:
      return 'auto';
  }
}

function buildGenerationPrompt(input: {
  title: string;
  brand: string;
  campaign: string;
  tags: string[];
  aspectRatio: string;
  quality: string;
  size: string;
  promptGeneration?: PromptGeneration;
  referenceImageUrl?: string;
}): string {
  const selectedJson = input.promptGeneration
    ? JSON.stringify(input.promptGeneration.generatedJson, null, 2).slice(0, 14000)
    : undefined;

  return [
    'Create a polished, production-ready marketing image.',
    input.promptGeneration ? undefined : `Primary creative brief: ${input.title}`,
    input.promptGeneration && input.title.trim()
      ? `Additional generation note from user: ${input.title}`
      : undefined,
    input.promptGeneration
      ? 'Use the selected JSON prompt as the source of truth for strategy, copy, layout, visual direction, and production notes.'
      : undefined,
    input.promptGeneration
      ? 'Use the Creative Generator settings below for aspect ratio, render size, quality, and image count. Ignore any conflicting aspectRatio, quality, or imageCount values inside the selected JSON.'
      : undefined,
    selectedJson ? `Selected JSON prompt:\n${selectedJson}` : undefined,
    input.referenceImageUrl
      ? 'Use the attached reference image for composition, subject continuity, visual hierarchy, palette, styling, and brand feel. Do not create an unrelated concept.'
      : undefined,
    `Brand: ${input.brand}`,
    `Campaign: ${input.campaign}`,
    `Aspect ratio: ${input.aspectRatio}`,
    `Render size: ${input.size}`,
    `Quality intent: ${input.quality}`,
    input.tags.length ? `Campaign tags: ${input.tags.join(', ')}` : undefined,
    'Use clean commercial composition, realistic lighting, crisp subject detail, and strong visual hierarchy.',
    'Avoid distorted text, watermarks, interface chrome, mockup borders, noisy artifacts, and low-resolution output.',
  ]
    .filter(Boolean)
    .join('\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-alphanumeric/space/dash
    .replace(/[\s_-]+/g, '_') // Replace spaces and dashes with underscore
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}

function userScopeIds(userId?: string) {
  return [...new Set([userId?.trim() || localCreativeUserId, localCreativeUserId])];
}

function asCpanelAssetType(value: unknown): CpanelAssetType | undefined {
  return value === 'generation' || value === 'reference' ? value : undefined;
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    return undefined;
  }

  const mimeType = match[1] || 'image/png';
  const data = match[3] ?? '';
  const buffer = match[2]
    ? Buffer.from(data, 'base64')
    : Buffer.from(decodeURIComponent(data), 'utf8');

  return { buffer, mimeType };
}

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split('/').filter(Boolean).pop();
    return fileName ? decodeURIComponent(fileName) : fallback;
  } catch {
    return fallback;
  }
}

function parseCpanelTargetFromUrl(url: string):
  | {
      filename?: string;
      subfolder: string;
      type: CpanelAssetType;
    }
  | undefined {
  if (url.startsWith('data:')) {
    return undefined;
  }

  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const typeIndex = segments.findIndex(
      (segment) => segment === 'generation' || segment === 'reference',
    );

    if (typeIndex >= 0 && segments[typeIndex + 1]) {
      return {
        filename: segments[typeIndex + 2],
        subfolder: segments[typeIndex + 1],
        type: segments[typeIndex] as CpanelAssetType,
      };
    }

    if (segments.length >= 2) {
      return {
        filename: segments[segments.length - 1],
        subfolder: segments[segments.length - 2],
        type: 'generation',
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function cpanelTargetForCreative(creative: CreativeModel) {
  const parsed = parseCpanelTargetFromUrl(creative.imageUrl);
  const subfolder = creative.cpanelSubfolder ?? parsed?.subfolder;

  if (!subfolder) {
    return undefined;
  }

  return {
    filename: creative.cpanelFilename ?? parsed?.filename,
    subfolder,
    type: creative.cpanelType ?? parsed?.type ?? 'generation',
  };
}

function mapCreativeRow(
  row: Record<string, unknown>,
  promptGeneration?: {
    generatedJson?: JsonObject;
    promptMetadata?: JsonObject;
    imageInsights?: Record<string, unknown>;
  },
): CreativeModel {
  const metadata = asRecord(row.metadata);
  const referenceImageUrl =
    normalizeCpanelAssetUrl(
      asOptionalString(row.reference_image_url) ?? asOptionalString(metadata.referenceImageUrl),
    ) ?? undefined;

  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    title: displayNameForCreative({ userNote: asString(row.title), promptGeneration }),
    brand: asString(row.brand, 'AI Creative Studio'),
    campaign: asString(row.campaign, 'AI Campaign'),
    tags: asStringArray(row.tags),
    date: asString(row.date),
    aspectRatio: asString(row.aspect_ratio, '1:1'),
    variant: asString(row.variant, 'mint'),
    favorite: row.favorite === true,
    imageUrl: normalizeCpanelAssetUrl(asString(row.image_url)) ?? '',
    createdAt: asString(row.created_at),
    cpanelFilename:
      asOptionalString(row.cpanel_filename) ?? asOptionalString(metadata.cpanelFilename),
    cpanelSubfolder:
      asOptionalString(row.cpanel_subfolder) ?? asOptionalString(metadata.cpanelSubfolder),
    cpanelType: asCpanelAssetType(row.cpanel_type) ?? asCpanelAssetType(metadata.cpanelType),
    promptGenerationId:
      asOptionalString(row.prompt_generation_id) ?? asOptionalString(metadata.promptGenerationId),
    referenceImageUrl,
  };
}

function isMissingCreativeMetadataColumn(error: unknown) {
  const record = asRecord(error);
  const message = asString(record.message);
  const code = asString(record.code);

  return (
    code === 'PGRST204' ||
    [
      'cpanel_type',
      'cpanel_subfolder',
      'cpanel_filename',
      'prompt_generation_id',
      'reference_image_url',
      'metadata',
    ].some((column) => message.includes(column))
  );
}

function urlFromReferenceImage(value: unknown) {
  const record = asRecord(value);
  return asOptionalString(record.url) ?? asOptionalString(record.link);
}

function referenceImageUrlsFromGeneration(promptGeneration: PromptGeneration) {
  const urls = [
    promptGeneration.referenceImageUrl,
    urlFromReferenceImage(promptGeneration.promptMetadata.referenceImage),
    urlFromReferenceImage(promptGeneration.generatedJson.referenceImage),
    ...asRecordArray(promptGeneration.promptMetadata.referenceImages).map(urlFromReferenceImage),
    ...asRecordArray(promptGeneration.generatedJson.referenceImages).map(urlFromReferenceImage),
    ...asRecordArray(promptGeneration.generatedJson.reference_images).map(urlFromReferenceImage),
  ].filter((url): url is string => Boolean(url));

  return [...new Set(urls)];
}

async function downloadReferenceImage(url?: string) {
  if (!url) {
    return undefined;
  }

  if (url.startsWith('data:')) {
    const decoded = decodeDataUrl(url);

    return decoded
      ? {
          buffer: decoded.buffer,
          fileName: 'reference-image.png',
          mimeType: decoded.mimeType,
        }
      : undefined;
  }

  const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
  const contentTypeHeader = response.headers['content-type'];
  const mimeType =
    typeof contentTypeHeader === 'string' ? contentTypeHeader.split(';')[0] : 'image/png';

  return {
    buffer: Buffer.from(response.data),
    fileName: fileNameFromUrl(url, 'reference-image.png'),
    mimeType: mimeType || 'image/png',
  };
}

export class CreativeService {
  private readonly creatives = new Map<string, CreativeModel[]>();

  async generateCreative(input: {
    userId?: string;
    title: string;
    brand?: string;
    campaign?: string;
    creativeName?: string;
    tags?: string[];
    aspectRatio?: string;
    quality?: string;
    imageCount?: number;
    promptGenerationId?: string;
    referenceImageUrl?: string;
  }): Promise<CreativeModel[]> {
    const userId = input.userId || localCreativeUserId;
    const brand = input.brand || 'AI Creative Studio';
    const campaign = input.campaign || 'AI Campaign';
    const tags = input.tags || ['AI Generated'];
    const aspectRatio = input.aspectRatio || '1:1';
    const quality = input.quality || 'high';
    const imageCount = input.imageCount || 1;
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const createdAt = new Date().toISOString();

    const variants = ['coral', 'mint', 'indigo', 'amber', 'rose', 'cyan'];
    const generatedCreatives: CreativeModel[] = [];
    const promptGeneration = input.promptGenerationId
      ? await promptService.getGenerationById(input.promptGenerationId, userId)
      : null;

    if (input.promptGenerationId && !promptGeneration) {
      throw new HttpError(404, 'Selected JSON prompt was not found.');
    }

    const referenceImageUrls = (
      input.referenceImageUrl
        ? [input.referenceImageUrl]
        : promptGeneration
          ? referenceImageUrlsFromGeneration(promptGeneration)
          : []
    ).map((url) => normalizeCpanelAssetUrl(url) ?? url);
    const referenceImageUrl = referenceImageUrls[0];

    const referenceImages = (
      await Promise.all(referenceImageUrls.map((url) => downloadReferenceImage(url)))
    ).filter((image): image is NonNullable<typeof image> => Boolean(image));
    const generationNote = input.title.trim();
    const requestedCreativeName = input.creativeName?.trim();
    const displayTitle = displayNameForCreative({
      userNote: requestedCreativeName || generationNote,
      promptGeneration,
    });

    for (let index = 0; index < imageCount; index++) {
      const id = randomUUID();
      const variant = variants[Math.floor(Math.random() * variants.length)];
      const title = imageCount > 1 ? `${displayTitle} ${index + 1}` : displayTitle;
      const imageSize = imageSizeForAspectRatio(aspectRatio);
      const imageQuality = imageQualityForSetting(quality);
      const generationPrompt = buildGenerationPrompt({
        title: generationNote,
        brand,
        campaign,
        tags,
        aspectRatio,
        quality,
        size: imageSize,
        promptGeneration: promptGeneration ?? undefined,
        referenceImageUrl,
      });
      let imageBuffer: Buffer;

      // Check if OpenAI API Key is configured in env
      if (env.openaiApiKey) {
        try {
          imageBuffer = await imageGenerationService.generateImage({
            prompt: generationPrompt,
            size: imageSize,
            quality: imageQuality,
            referenceImages,
          });
        } catch (err) {
          if (referenceImages.length) {
            throw err;
          }

          console.error(`${openAIImageModel} generation failed, falling back to local PNG:`, err);
          imageBuffer = createFallbackPng({ title, variant, size: imageSize });
        }
      } else {
        if (referenceImages.length) {
          throw new HttpError(
            503,
            'OpenAI API key is required to generate from a reference image.',
          );
        }

        console.warn('OPENAI_API_KEY is not configured, generating a local PNG fallback.');
        imageBuffer = createFallbackPng({ title, variant, size: imageSize });
      }

      // Generate descriptive file name using campaign context
      const fileSlug = slugify(displayTitle).slice(0, 30) || 'concept';
      const fileName = `${fileSlug}_${id.slice(0, 8)}_option_${index + 1}.png`;
      let imageUrl = '';
      let cpanelFilename: string | undefined;
      let cpanelSubfolder: string | undefined;
      const cpanelType: CpanelAssetType = 'generation';

      try {
        const uploadResponse = await cpanelAssetService.uploadImage({
          buffer: imageBuffer,
          fileName,
          mimeType: 'image/png',
          type: cpanelType,
        });

        if (uploadResponse.url) {
          imageUrl = uploadResponse.url;
          cpanelFilename = uploadResponse.filename;
          cpanelSubfolder = uploadResponse.subfolder;
        } else {
          imageUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
        }
      } catch (err) {
        console.error('Failed to upload to cpanel:', err);
        imageUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      }

      const metadata: JsonObject = {
        cpanelFilename,
        cpanelSubfolder,
        cpanelType,
        displayTitle: title,
        manualTitle: requestedCreativeName || undefined,
        promptGenerationId: promptGeneration?.id,
        referenceImageUrl,
        referenceImageUrls,
      };

      const creativeItem: CreativeModel = {
        id,
        userId,
        title,
        brand,
        campaign,
        tags: [...tags, aspectRatio, quality],
        date,
        aspectRatio,
        variant,
        favorite: false,
        imageUrl,
        createdAt,
        cpanelFilename,
        cpanelSubfolder,
        cpanelType,
        promptGenerationId: promptGeneration?.id,
        referenceImageUrl,
      };

      // Save to Supabase if connected
      if (supabaseClient) {
        const legacyRow = {
          id: creativeItem.id,
          user_id: creativeItem.userId,
          title: creativeItem.title,
          brand: creativeItem.brand,
          campaign: creativeItem.campaign,
          tags: creativeItem.tags,
          date: creativeItem.date,
          aspect_ratio: creativeItem.aspectRatio,
          variant: creativeItem.variant,
          favorite: creativeItem.favorite,
          image_url: creativeItem.imageUrl,
        };
        const { error } = await supabaseClient.from('creatives').insert({
          ...legacyRow,
          cpanel_filename: cpanelFilename,
          cpanel_subfolder: cpanelSubfolder,
          cpanel_type: cpanelType,
          metadata,
          prompt_generation_id: promptGeneration?.id,
          reference_image_url: referenceImageUrl,
        });

        if (error) {
          if (isMissingCreativeMetadataColumn(error)) {
            const { error: legacyError } = await supabaseClient.from('creatives').insert(legacyRow);

            if (legacyError) {
              console.error('Failed to save creative to database:', legacyError);
            }
          } else {
            console.error('Failed to save creative to database:', error);
          }
        }
      }

      // Add to local memory map
      const userList = this.creatives.get(userId) || [];
      userList.push(creativeItem);
      this.creatives.set(userId, userList);

      generatedCreatives.push(creativeItem);
    }

    return generatedCreatives;
  }

  async listCreatives(userId?: string): Promise<CreativeModel[]> {
    const accessibleUserIds = userScopeIds(userId);
    const readClient = supabaseAdminClient ?? supabaseClient;

    if (readClient) {
      const { data, error } = supabaseAdminClient
        ? await readClient
            .from('creatives')
            .select('*')
            .order('created_at', { ascending: false })
        : await readClient
            .from('creatives')
            .select('*')
            .in('user_id', accessibleUserIds)
            .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch creatives from database:', error);
      } else if (data) {
        const creativeRows = data as Record<string, unknown>[];
        const generationIds = Array.from(
          new Set(
            creativeRows
              .map((row) => asOptionalString(row.prompt_generation_id))
              .filter((id): id is string => Boolean(id)),
          ),
        );
        const generationMap = new Map<
          string,
          {
            generatedJson?: JsonObject;
            promptMetadata?: JsonObject;
            imageInsights?: Record<string, unknown>;
          }
        >();

        if (generationIds.length) {
          const { data: generationRows, error: generationError } = await readClient
            .from('prompt_generations')
            .select('id, generated_json, prompt_metadata, image_insights')
            .in('id', generationIds);

          if (generationError) {
            console.error('Failed to fetch creative prompt names:', generationError);
          } else {
            (generationRows as Record<string, unknown>[] | null)?.forEach((row) => {
              const id = asOptionalString(row.id);

              if (id) {
                generationMap.set(id, {
                  generatedJson: asRecord(row.generated_json),
                  promptMetadata: asRecord(row.prompt_metadata),
                  imageInsights: asRecord(row.image_insights),
                });
              }
            });
          }
        }

        return creativeRows.map((row) =>
          mapCreativeRow(row, generationMap.get(asString(row.prompt_generation_id))),
        );
      }
    }

    return [...this.creatives.values()].flat();
  }

  async deleteCreative(input: { id: string; userId?: string }): Promise<boolean> {
    const accessibleUserIds = userScopeIds(input.userId);
    let creative: CreativeModel | undefined;

    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('creatives')
        .select('*')
        .eq('id', input.id)
        .in('user_id', accessibleUserIds)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch creative before delete:', error);
      } else if (data) {
        creative = mapCreativeRow(data as Record<string, unknown>);
      }
    }

    if (!creative) {
      creative = accessibleUserIds
        .flatMap((id) => this.creatives.get(id) ?? [])
        .find((item) => item.id === input.id);
    }

    if (creative) {
      const cpanelTarget = cpanelTargetForCreative(creative);

      if (cpanelTarget?.subfolder) {
        await cpanelAssetService.deleteFolder({
          subfolder: cpanelTarget.subfolder,
          type: cpanelTarget.type,
        });
      }
    }

    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('creatives')
        .delete()
        .eq('id', input.id)
        .in('user_id', accessibleUserIds);

      if (error) {
        console.error('Failed to delete creative:', error);
      }
    }

    accessibleUserIds.forEach((id) => {
      const userList = this.creatives.get(id) ?? [];
      this.creatives.set(
        id,
        userList.filter((item) => item.id !== input.id),
      );
    });

    return true;
  }
}

export const creativeService = new CreativeService();
