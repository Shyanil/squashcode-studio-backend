export type JsonObject = Record<string, unknown>;

export type PromptSourceType = 'text' | 'image' | 'mixed';
export type PromptSessionStatus = 'draft' | 'active' | 'generated' | 'archived';
export type PromptMessageRole = 'user' | 'assistant' | 'system';

export interface CreativeContext extends JsonObject {
  industry?: string;
  campaignType?: string;
  marketingGoal?: string;
  subject?: string;
  objects?: string[];
  background?: string;
  composition?: string;
  visualHierarchy?: string;
  typography?: string;
  fontStyle?: string;
  colors?: string[];
  brandStyle?: string;
  mood?: string;
  lighting?: string;
  cameraAngle?: string;
  cta?: string | null;
  whiteSpace?: string;
  logoPlacement?: string;
  designStyle?: string;
  platform?: string;
  aspectRatio?: string;
  imageQuality?: string;
  designTechniques?: string[];
  effectiveness?: string;
  audience?: string;
  constraints?: string[];
  userRequests?: string[];
  unresolvedQuestions?: string[];
}

export interface ImageAnalysis extends JsonObject {
  summary?: string;
  industry?: string;
  campaignType?: string;
  marketingGoal?: string;
  subject?: string;
  objects?: string[];
  background?: string;
  composition?: string;
  visualHierarchy?: string;
  typography?: string;
  fontStyle?: string;
  colors?: string[];
  brandStyle?: string;
  mood?: string;
  lighting?: string;
  cameraAngle?: string;
  cta?: string | null;
  whiteSpace?: string;
  logoPlacement?: string;
  designStyle?: string;
  platform?: string;
  aspectRatio?: string;
  imageQuality?: string;
  designTechniques?: string[];
  whyThisCreativeWorks?: string[];
  creativeContext?: CreativeContext;
}

export interface PromptMemoryItem extends JsonObject {
  sessionId: string;
  title: string;
  reason: string;
  creativeContext: CreativeContext;
  generatedJson?: JsonObject;
  createdAt?: string;
}

export interface PromptSession {
  id: string;
  userId: string;
  title: string;
  sourceType: PromptSourceType;
  status: PromptSessionStatus;
  brandContext: JsonObject;
  metadata: JsonObject;
  creativeContext: CreativeContext;
  imageAnalysis: ImageAnalysis;
  memoryContext: PromptMemoryItem[];
  createdAt: string;
  updatedAt: string;
  lastGeneratedAt?: string | null;
}

export interface PromptMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: PromptMessageRole;
  content: string;
  contentJson: JsonObject;
  metadata: JsonObject;
  createdAt: string;
}

export interface PromptAsset {
  id: string;
  sessionId: string;
  userId: string;
  bucketName: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  url?: string;
  cpanelFilename?: string;
  cpanelSubfolder?: string;
  cpanelType?: 'generation' | 'reference';
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface PromptGeneration {
  id: string;
  sessionId: string;
  userId: string;
  versionNumber: number;
  promptText: string;
  generatedJson: JsonObject;
  promptMetadata: JsonObject;
  imageInsights: ImageAnalysis;
  referenceImagePath?: string;
  referenceImageUrl?: string;
  modelName?: string;
  aspectRatio: string;
  quality: string;
  imageCount: number;
  status: 'queued' | 'completed' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptUploadedImage {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size?: number;
}

export interface PromptOutputOptions {
  aspectRatio?: string;
  quality?: string;
  imageCount?: number;
}
