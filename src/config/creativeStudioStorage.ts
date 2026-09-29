export const CREATIVE_STUDIO_STORAGE_BUCKET = 'creative-studio-assets';

export type CreativeStudioAssetKind = 'generation' | 'reference' | 'supporting_reference' | 'manual';

export function generationObjectPath(input: {
  userId: string;
  folderId?: string;
  creativeId: string;
  fileName: string;
}) {
  const folderSegment = input.folderId?.trim() || 'uncategorized';
  return `generations/${input.userId}/${folderSegment}/${input.creativeId}/${input.fileName}`;
}

export function referenceObjectPath(input: {
  userId: string;
  sessionId: string;
  fileName: string;
  role: 'primary' | 'supporting';
  timestamp?: number;
}) {
  const stamp = input.timestamp ?? Date.now();
  const prefix = input.role === 'supporting' ? 'references/supporting' : 'references/primary';
  return `${prefix}/${input.userId}/${input.sessionId}/${stamp}-${input.fileName}`;
}

export function manualUploadObjectPath(input: {
  userId: string;
  fileName: string;
  timestamp?: number;
}) {
  const stamp = input.timestamp ?? Date.now();
  return `uploads/manual/${input.userId}/${stamp}-${input.fileName}`;
}
