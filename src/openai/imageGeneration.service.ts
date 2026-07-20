import { createOpenAIClient } from '@/config/openai';
import { HttpError } from '@/utils/httpError';
import type { ImageEditParams, ImageGenerateParams } from 'openai/resources/images';
import { toFile } from 'openai/uploads';

export type ImageGenerationQuality = 'low' | 'medium' | 'high' | 'auto';

export interface GenerateImageInput {
  prompt: string;
  referenceImage?: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  };
  referenceImages?: Array<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }>;
  size?: string;
  quality?: ImageGenerationQuality;
}

export const openAIImageModel = 'gpt-image-2';

type ImageEditSize = NonNullable<ImageEditParams['size']>;
type ImageGenerateSize = NonNullable<ImageGenerateParams['size']>;

const defaultImageSize = '1024x1024';
const imageEditSizes = [
  '256x256',
  '512x512',
  '1024x1024',
  '1536x1024',
  '1024x1536',
  'auto',
] as const satisfies readonly ImageEditSize[];
const imageGenerateSizes = [
  'auto',
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '256x256',
  '512x512',
  '1792x1024',
  '1024x1792',
] as const satisfies readonly ImageGenerateSize[];

function isImageEditSize(size: string): size is ImageEditSize {
  return (imageEditSizes as readonly string[]).includes(size);
}

function isImageGenerateSize(size: string): size is ImageGenerateSize {
  return (imageGenerateSizes as readonly string[]).includes(size);
}

function toImageEditSize(size?: string): ImageEditSize {
  return size && isImageEditSize(size) ? size : defaultImageSize;
}

function toImageGenerateSize(size?: string): ImageGenerateSize {
  return size && isImageGenerateSize(size) ? size : defaultImageSize;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export class ImageGenerationService {
  async generateImage(input: GenerateImageInput): Promise<Buffer> {
    const client = createOpenAIClient();

    if (!client) {
      throw new HttpError(503, 'OpenAI API key is not configured.');
    }

    try {
      const referenceImages = [
        ...(input.referenceImage ? [input.referenceImage] : []),
        ...(input.referenceImages ?? []),
      ];

      if (referenceImages.length) {
        const imageFiles = await Promise.all(
          referenceImages.map((referenceImage) =>
            toFile(referenceImage.buffer, referenceImage.fileName, {
              type: referenceImage.mimeType,
            }),
          ),
        );
        const response = await client.images.edit({
          model: openAIImageModel,
          prompt: input.prompt,
          image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
          n: 1,
          size: toImageEditSize(input.size),
          quality: input.quality ?? 'high',
        });

        const b64Json = response?.data?.[0]?.b64_json;
        if (!b64Json) {
          throw new HttpError(502, 'OpenAI did not return any edited image data.');
        }

        return Buffer.from(b64Json, 'base64');
      }

      const response = await client.images.generate({
        model: openAIImageModel,
        prompt: input.prompt,
        n: 1,
        size: toImageGenerateSize(input.size),
        quality: input.quality ?? 'high',
        output_format: 'png',
      });

      const b64Json = response?.data?.[0]?.b64_json;
      if (!b64Json) {
        throw new HttpError(502, 'OpenAI did not return any image data.');
      }

      return Buffer.from(b64Json, 'base64');
    } catch (err: unknown) {
      throw new HttpError(502, `OpenAI Image Generation failed: ${errorMessage(err)}`);
    }
  }
}

export const imageGenerationService = new ImageGenerationService();
