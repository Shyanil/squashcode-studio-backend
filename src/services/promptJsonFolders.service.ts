import { supabaseAdminClient, supabaseClient } from '@/supabase/client';
import { HttpError } from '@/utils/httpError';

export interface PromptJsonFolderModel {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color: string;
  sortOrder: number;
  jsonCount: number;
  createdAt: string;
  updatedAt: string;
}

const localUserId = '00000000-0000-4000-8000-000000000001';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapFolderRow(row: Record<string, unknown>, jsonCount = 0): PromptJsonFolderModel {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    name: asString(row.name, 'Untitled folder'),
    description: asOptionalString(row.description),
    color: asString(row.color, 'slate'),
    sortOrder: asNumber(row.sort_order),
    jsonCount,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function isMissingFolderSchema(error: unknown) {
  const record = asRecord(error);
  const code = asString(record.code);
  const message = asString(record.message);

  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('prompt_json_folders') ||
    message.includes('folder_id')
  );
}

function isDuplicateName(error: unknown) {
  const record = asRecord(error);

  return (
    asString(record.code) === '23505' ||
    asString(record.message).includes('prompt_json_folders_user_name_key')
  );
}

function missingSchemaError() {
  return new HttpError(
    503,
    'Prompt JSON folders are not set up yet. Run supabase/prompt-json-folders.sql in the Supabase SQL editor.',
  );
}

function requireName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';

  if (!name) {
    throw new HttpError(400, 'Folder name is required.');
  }

  if (name.length > 80) {
    throw new HttpError(400, 'Keep the folder name under 80 characters.');
  }

  return name;
}

export class PromptJsonFoldersService {
  private readClient() {
    return supabaseAdminClient ?? supabaseClient;
  }

  private writeClient() {
    return supabaseAdminClient ?? supabaseClient;
  }

  async listFolders(): Promise<PromptJsonFolderModel[]> {
    const client = this.readClient();

    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from('prompt_json_folders')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to fetch prompt JSON folders:', error);
      throw new HttpError(500, 'Failed to load folders.');
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const counts = await this.folderCounts();

    return rows.map((row) => mapFolderRow(row, counts.get(asString(row.id)) ?? 0));
  }

  private async folderCounts(): Promise<Map<string, number>> {
    const client = this.readClient();
    const counts = new Map<string, number>();

    if (!client) {
      return counts;
    }

    const { data, error } = await client.from('prompt_generations').select('folder_id');

    if (error) {
      if (!isMissingFolderSchema(error)) {
        console.error('Failed to count JSON per folder:', error);
      }

      return counts;
    }

    ((data ?? []) as Record<string, unknown>[]).forEach((row) => {
      const folderId = asOptionalString(row.folder_id);

      if (folderId) {
        counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
      }
    });

    return counts;
  }

  async createFolder(input: {
    userId?: string;
    name: unknown;
    description?: unknown;
    color?: unknown;
  }): Promise<PromptJsonFolderModel> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const name = requireName(input.name);
    const { data, error } = await client
      .from('prompt_json_folders')
      .insert({
        user_id: input.userId?.trim() || localUserId,
        name,
        description: asOptionalString(input.description),
        color: asOptionalString(input.color) ?? 'slate',
      })
      .select()
      .single();

    if (error) {
      if (isDuplicateName(error)) {
        throw new HttpError(409, `A folder named "${name}" already exists.`);
      }

      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to create prompt JSON folder:', error);
      throw new HttpError(500, 'Failed to create the folder.');
    }

    return mapFolderRow(asRecord(data), 0);
  }

  async deleteFolder(id: string): Promise<boolean> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const { error } = await client.from('prompt_json_folders').delete().eq('id', id);

    if (error) {
      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to delete prompt JSON folder:', error);
      throw new HttpError(500, 'Failed to delete the folder.');
    }

    return true;
  }

  async assignGeneration(input: { generationId: string; folderId?: string | null }): Promise<boolean> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const folderId =
      typeof input.folderId === 'string' && input.folderId.trim() ? input.folderId.trim() : null;

    if (folderId) {
      const { data: folder, error: folderError } = await client
        .from('prompt_json_folders')
        .select('id')
        .eq('id', folderId)
        .maybeSingle();

      if (folderError && isMissingFolderSchema(folderError)) {
        throw missingSchemaError();
      }

      if (!folder) {
        throw new HttpError(404, 'Folder was not found.');
      }
    }

    const { error } = await client
      .from('prompt_generations')
      .update({ folder_id: folderId })
      .eq('id', input.generationId);

    if (error) {
      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to assign generation to folder:', error);
      throw new HttpError(500, 'Failed to save JSON to the folder.');
    }

    return true;
  }
}

export const promptJsonFoldersService = new PromptJsonFoldersService();
