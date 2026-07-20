import axios from 'axios';

import { env } from '@/config/env';
import { HttpError } from '@/utils/httpError';

export type CpanelAssetType = 'generation' | 'reference';

export interface CpanelUploadResult {
  filename: string;
  raw: unknown;
  subfolder?: string;
  url?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function uploadErrorMessage(data: unknown): string | undefined {
  const record = asRecord(data);
  return asString(record.error) ?? asString(record.message);
}

function bufferToBlob(buffer: Buffer, mimeType: string) {
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new Blob([bytes], { type: mimeType });
}

export class CpanelAssetService {
  async uploadImage(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    type: CpanelAssetType;
  }): Promise<CpanelUploadResult> {
    const formData = new FormData();
    formData.append('type', input.type);
    formData.append('filename', input.fileName);
    formData.append('image', bufferToBlob(input.buffer, input.mimeType), input.fileName);

    const response = await axios.post(env.cpanelUploadDeleteUrl, formData);
    const data = asRecord(response.data);
    const error = uploadErrorMessage(response.data);

    if (error && !asString(data.url)) {
      throw new HttpError(502, `CPanel upload failed: ${error}`);
    }

    return {
      filename: asString(data.filename) ?? input.fileName,
      raw: response.data,
      subfolder: asString(data.subfolder) ?? asString(data.folder),
      url: asString(data.url) ?? asString(data.link),
    };
  }

  async uploadSupportingImage(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    subfolder?: string;
  }): Promise<CpanelUploadResult> {
    const formData = new FormData();
    if (input.subfolder) {
      formData.append('subfolder', input.subfolder);
    }
    formData.append('filename', input.fileName);
    formData.append('image', bufferToBlob(input.buffer, input.mimeType), input.fileName);

    const response = await axios.post(env.cpanelSupportingUploadUrl, formData);
    const data = asRecord(response.data);
    const error = uploadErrorMessage(response.data);

    if (error && !asString(data.url)) {
      throw new HttpError(502, `CPanel supporting upload failed: ${error}`);
    }

    return {
      filename: asString(data.filename) ?? input.fileName,
      raw: response.data,
      subfolder: asString(data.subfolder) ?? asString(data.folder),
      url: asString(data.url) ?? asString(data.link),
    };
  }

  async deleteFolder(input: { subfolder: string; type: CpanelAssetType }) {
    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('type', input.type);
    formData.append('subfolder', input.subfolder);

    const response = await axios.post(env.cpanelUploadDeleteUrl, formData);
    const error = uploadErrorMessage(response.data);

    if (error) {
      throw new HttpError(502, `CPanel folder delete failed: ${error}`);
    }

    return response.data;
  }

  async deleteFile(input: { filename: string; subfolder: string; type: CpanelAssetType }) {
    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('type', input.type);
    formData.append('subfolder', input.subfolder);
    formData.append('filename', input.filename);

    const response = await axios.post(env.cpanelUploadDeleteUrl, formData);
    const error = uploadErrorMessage(response.data);

    if (error) {
      throw new HttpError(502, `CPanel file delete failed: ${error}`);
    }

    return response.data;
  }
}

export const cpanelAssetService = new CpanelAssetService();
