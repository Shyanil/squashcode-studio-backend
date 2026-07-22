import { randomUUID } from 'crypto';

import { supabaseClient } from '@/supabase/client';
import { HttpError } from '@/utils/httpError';

export type CreativeFeedbackSignalType =
  | 'favorite'
  | 'unfavorite'
  | 'like'
  | 'dislike'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'exported'
  | 'deleted'
  | 'manual_note';

export type JsonObject = Record<string, unknown>;

export interface CreativeFeedback {
  id: string;
  creativeId: string;
  promptGenerationId?: string | null;
  userId: string;
  signalType: CreativeFeedbackSignalType;
  score: number;
  comment?: string | null;
  metadata: JsonObject;
  createdAt: string;
}

const feedbackScoreBySignal: Record<CreativeFeedbackSignalType, number> = {
  approved: 4,
  deleted: -2,
  dislike: -3,
  exported: 2,
  favorite: 3,
  like: 2,
  manual_note: 2,
  rejected: -4,
  revision_requested: 1,
  unfavorite: -2,
};

const validSignals = new Set<CreativeFeedbackSignalType>(
  Object.keys(feedbackScoreBySignal) as CreativeFeedbackSignalType[],
);

function asRecord(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function normalizeSignal(signalType: string): CreativeFeedbackSignalType {
  if (validSignals.has(signalType as CreativeFeedbackSignalType)) {
    return signalType as CreativeFeedbackSignalType;
  }

  return 'manual_note';
}

function scoreForSignal(signalType: CreativeFeedbackSignalType, metadata: JsonObject) {
  if (signalType === 'manual_note' && metadata.score !== undefined) {
    return asNumber(metadata.score, feedbackScoreBySignal.manual_note);
  }

  return feedbackScoreBySignal[signalType];
}

function mapFeedbackRow(row: Record<string, unknown>): CreativeFeedback {
  return {
    id: asString(row.id) ?? '',
    creativeId: asString(row.creative_id) ?? '',
    promptGenerationId: asNullableString(row.prompt_generation_id),
    userId: asString(row.user_id) ?? '',
    signalType: normalizeSignal(asString(row.signal_type) ?? 'manual_note'),
    score: asNumber(row.score),
    comment: asNullableString(row.comment),
    metadata: asRecord(row.metadata),
    createdAt: asString(row.created_at) ?? new Date().toISOString(),
  };
}

export class CreativeFeedbackService {
  private readonly feedback = new Map<string, CreativeFeedback[]>();

  async createFeedback(
    creativeId: string,
    userId: string,
    signalType: CreativeFeedbackSignalType,
    comment?: string,
    metadata: JsonObject = {},
  ): Promise<CreativeFeedback> {
    const normalizedSignal = normalizeSignal(signalType);
    const promptGenerationId = asString(metadata.promptGenerationId);
    const score = scoreForSignal(normalizedSignal, metadata);
    const createdAt = new Date().toISOString();

    const feedback: CreativeFeedback = {
      id: randomUUID(),
      creativeId,
      promptGenerationId: promptGenerationId ?? null,
      userId,
      signalType: normalizedSignal,
      score,
      comment: comment?.trim() || null,
      metadata,
      createdAt,
    };

    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('creative_feedback')
        .insert({
          id: feedback.id,
          creative_id: feedback.creativeId,
          prompt_generation_id: feedback.promptGenerationId,
          user_id: feedback.userId,
          signal_type: feedback.signalType,
          score: feedback.score,
          comment: feedback.comment,
          metadata: feedback.metadata,
          created_at: feedback.createdAt,
        })
        .select()
        .single();

      if (error) {
        throw new HttpError(502, `Supabase creative feedback create failed: ${error.message}`);
      }

      if (data) {
        const saved = mapFeedbackRow(data as Record<string, unknown>);
        const list = this.feedback.get(creativeId) ?? [];
        this.feedback.set(creativeId, [saved, ...list]);
        return saved;
      }
    }

    const list = this.feedback.get(creativeId) ?? [];
    this.feedback.set(creativeId, [feedback, ...list]);

    return feedback;
  }

  async getFeedbackForCreative(creativeId: string): Promise<CreativeFeedback[]> {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('creative_feedback')
        .select('*')
        .eq('creative_id', creativeId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new HttpError(502, `Supabase creative feedback list failed: ${error.message}`);
      }

      if (data) {
        return (data as Record<string, unknown>[]).map(mapFeedbackRow);
      }
    }

    return this.feedback.get(creativeId) ?? [];
  }
}

export const creativeFeedbackService = new CreativeFeedbackService();
