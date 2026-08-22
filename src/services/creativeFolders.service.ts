import { supabaseAdminClient, supabaseClient } from '@/supabase/client';
import { HttpError } from '@/utils/httpError';

export interface CreativeFolderModel {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color: string;
  sortOrder: number;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

const localCreativeUserId = '00000000-0000-4000-8000-000000000001';

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

function mapFolderRow(row: Record<string, unknown>, imageCount = 0): CreativeFolderModel {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    name: asString(row.name, 'Untitled folder'),
    description: asOptionalString(row.description),
    color: asString(row.color, 'slate'),
    sortOrder: asNumber(row.sort_order),
    imageCount,
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
    message.includes('creative_folders') ||
    message.includes('folder_id')
  );
}

function isDuplicateName(error: unknown) {
  const record = asRecord(error);

  return (
    asString(record.code) === '23505' ||
    asString(record.message).includes('creative_folders_user_name_key')
  );
}

function missingSchemaError() {
  return new HttpError(
    503,
    'Creative folders are not set up yet. Run supabase/creative-folders.sql in the Supabase SQL editor.',
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

export class CreativeFoldersService {
  private readClient() {
    return supabaseAdminClient ?? supabaseClient;
  }

  private writeClient() {
    return supabaseAdminClient ?? supabaseClient;
  }

  /**
   * Folders are shared across the studio team, the same way listCreatives
   * returns every creative regardless of who generated it.
   */
  async listFolders(): Promise<CreativeFolderModel[]> {
    const client = this.readClient();

    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from('creative_folders')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to fetch creative folders:', error);
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

    const { data, error } = await client.from('creatives').select('folder_id');

    if (error) {
      if (!isMissingFolderSchema(error)) {
        console.error('Failed to count creatives per folder:', error);
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
  }): Promise<CreativeFolderModel> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const name = requireName(input.name);
    const { data, error } = await client
      .from('creative_folders')
      .insert({
        user_id: input.userId?.trim() || localCreativeUserId,
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

      console.error('Failed to create creative folder:', error);
      throw new HttpError(500, 'Failed to create the folder.');
    }

    return mapFolderRow(asRecord(data), 0);
  }

  async updateFolder(input: {
    id: string;
    name?: unknown;
    description?: unknown;
    color?: unknown;
  }): Promise<CreativeFolderModel> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const patch: Record<string, unknown> = {};

    if (input.name !== undefined) {
      patch.name = requireName(input.name);
    }

    if (input.description !== undefined) {
      patch.description = asOptionalString(input.description) ?? null;
    }

    if (input.color !== undefined) {
      patch.color = asOptionalString(input.color) ?? 'slate';
    }

    if (!Object.keys(patch).length) {
      throw new HttpError(400, 'Nothing to update.');
    }

    const { data, error } = await client
      .from('creative_folders')
      .update(patch)
      .eq('id', input.id)
      .select()
      .maybeSingle();

    if (error) {
      if (isDuplicateName(error)) {
        throw new HttpError(409, 'A folder with that name already exists.');
      }

      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to update creative folder:', error);
      throw new HttpError(500, 'Failed to update the folder.');
    }

    if (!data) {
      throw new HttpError(404, 'Folder was not found.');
    }

    const counts = await this.folderCounts();

    return mapFolderRow(asRecord(data), counts.get(input.id) ?? 0);
  }

  /**
   * Deleting a folder never deletes images. The foreign key is
   * `on delete set null`, so its creatives move back to Unsorted.
   */
  async deleteFolder(id: string): Promise<boolean> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const { error } = await client.from('creative_folders').delete().eq('id', id);

    if (error) {
      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to delete creative folder:', error);
      throw new HttpError(500, 'Failed to delete the folder.');
    }

    return true;
  }

  async assignCreative(input: { creativeId: string; folderId?: string | null }): Promise<boolean> {
    const client = this.writeClient();

    if (!client) {
      throw new HttpError(503, 'Supabase is not configured.');
    }

    const folderId = typeof input.folderId === 'string' && input.folderId.trim()
      ? input.folderId.trim()
      : null;

    if (folderId) {
      const { data: folder, error: folderError } = await client
        .from('creative_folders')
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
      .from('creatives')
      .update({ folder_id: folderId })
      .eq('id', input.creativeId);

    if (error) {
      if (isMissingFolderSchema(error)) {
        throw missingSchemaError();
      }

      console.error('Failed to move creative into folder:', error);
      throw new HttpError(500, 'Failed to move the image.');
    }

    return true;
  }
}

export const creativeFoldersService = new CreativeFoldersService();
