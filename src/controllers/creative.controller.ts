import type { Request, Response } from 'express';
import { creativeService } from '@/services/creative.service';
import { normalizeCpanelAssetUrl } from '@/services/cpanelAsset.service';
import {
  creativeFeedbackService,
  type CreativeFeedbackSignalType,
  type JsonObject,
} from '@/services/creativeFeedback.service';
import {
  creativeMetricsService,
  type CreativeMetrics,
  type CreativeMetricsPayload,
} from '@/services/creativeMetrics.service';
import { asyncHandler } from '@/utils/asyncHandler';
import { HttpError } from '@/utils/httpError';
import { supabaseClient } from '@/supabase/client';
import { displayNameForCreative } from '@/utils/displayName';

const localCreativeUserId = '00000000-0000-4000-8000-000000000001';
const validFeedbackSignals = new Set<CreativeFeedbackSignalType>([
  'favorite',
  'unfavorite',
  'like',
  'dislike',
  'approved',
  'rejected',
  'revision_requested',
  'exported',
  'deleted',
  'manual_note',
]);

function requestUserId(request: Request) {
  const headerUserId = request.header('x-user-id');
  return headerUserId ?? undefined;
}

function activeUserId(request: Request) {
  return requestUserId(request) ?? localCreativeUserId;
}

function requestBody(request: Request): JsonObject {
  return typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body)
    ? (request.body as JsonObject)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asJsonObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function requireFeedbackSignal(value: unknown): CreativeFeedbackSignalType {
  if (typeof value === 'string' && validFeedbackSignals.has(value as CreativeFeedbackSignalType)) {
    return value as CreativeFeedbackSignalType;
  }

  throw new HttpError(400, 'signalType is required.');
}

function feedbackScore(feedback: { score: number }[]) {
  return feedback.reduce((total, item) => total + item.score, 0);
}

function metricPerformanceScore(metrics: CreativeMetrics[]) {
  return metrics.reduce((total, item) => {
    const reachScore = Math.min((item.reach ?? 0) / 1000, 5);
    const clickScore = Math.min((item.clicks ?? 0) / 100, 3);
    const conversionScore = Math.min((item.conversions ?? 0) * 0.5, 5);
    const ctrScore = Math.min((item.ctr ?? 0) / 2, 5);
    const revenueScore =
      item.revenue !== null && item.revenue !== undefined && item.spend !== null && item.spend !== undefined
        ? Math.max(-3, Math.min((item.revenue - item.spend) / 1000, 5))
        : 0;

    return total + reachScore + clickScore + conversionScore + ctrScore + revenueScore;
  }, 0);
}

function metricsPayloadFromBody(body: JsonObject): CreativeMetricsPayload {
  return {
    campaignName: asString(body.campaignName) ?? asString(body.campaign_name),
    capturedAt: asString(body.capturedAt) ?? asString(body.captured_at),
    clicks: asNumber(body.clicks),
    conversionRate: asNumber(body.conversionRate) ?? asNumber(body.conversion_rate),
    conversions: asNumber(body.conversions),
    ctr: asNumber(body.ctr),
    impressions: asNumber(body.impressions),
    platform: asString(body.platform),
    rawMetrics: asJsonObject(body.rawMetrics ?? body.raw_metrics),
    reach: asNumber(body.reach),
    revenue: asNumber(body.revenue),
    spend: asNumber(body.spend),
  };
}

export const creativeController = {
  generate: asyncHandler(async (request: Request, response: Response) => {
    const userId = requestUserId(request);
    const body = request.body || {};
    const result = await creativeService.generateCreative({
      userId,
      title: typeof body.title === 'string' ? body.title : 'New Visual Concept',
      brand: body.brand,
      campaign: body.campaign,
      creativeName:
        typeof body.creativeName === 'string'
          ? body.creativeName
          : typeof body.creative_name === 'string'
            ? body.creative_name
            : undefined,
      tags: body.tags,
      aspectRatio: body.aspectRatio,
      quality: body.quality,
      imageCount: body.imageCount,
      promptGenerationId: body.promptGenerationId,
      referenceImageUrl: body.referenceImageUrl,
    });
    response.status(200).json({ data: result });
  }),

  list: asyncHandler(async (request: Request, response: Response) => {
    const userId = requestUserId(request);
    const result = await creativeService.listCreatives(userId);
    response.status(200).json({ data: result });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    await creativeService.deleteCreative({ id, userId: requestUserId(request) });

    response.status(200).json({ data: true });
  }),

  toggleFavorite: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = activeUserId(request);

    let updated = null;
    if (supabaseClient) {
      // Fetch current favorite state
      const { data } = await supabaseClient
        .from('creatives')
        .select('favorite')
        .eq('id', id)
        .single();

      if (data) {
        const nextFav = !data.favorite;
        const { data: updatedData } = await supabaseClient
          .from('creatives')
          .update({ favorite: nextFav })
          .eq('id', id)
          .select()
          .single();

        if (updatedData) {
          const signalType = nextFav ? 'favorite' : 'unfavorite';

          creativeFeedbackService
            .createFeedback(id, userId, signalType, undefined, {
              promptGenerationId: updatedData.prompt_generation_id,
              source: 'favorite_toggle',
            })
            .catch((error) => {
              console.error('Failed to capture favorite feedback:', error);
            });

          updated = {
            id: updatedData.id,
            userId: updatedData.user_id,
            title: displayNameForCreative({ userNote: updatedData.title }),
            brand: updatedData.brand,
            campaign: updatedData.campaign,
            tags: updatedData.tags,
            date: updatedData.date,
            aspectRatio: updatedData.aspect_ratio,
            variant: updatedData.variant,
            favorite: updatedData.favorite,
            imageUrl: normalizeCpanelAssetUrl(updatedData.image_url) ?? updatedData.image_url,
          };
        }
      }
    }

    response.status(200).json({ data: updated });
  }),

  createFeedback: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const body = requestBody(request);
    const signalType = requireFeedbackSignal(body.signalType ?? body.signal_type);
    const result = await creativeFeedbackService.createFeedback(
      id,
      activeUserId(request),
      signalType,
      asString(body.comment),
      asJsonObject(body.metadata),
    );

    response.status(201).json({ data: result });
  }),

  recordMetrics: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const result = await creativeMetricsService.recordMetrics(
      id,
      activeUserId(request),
      metricsPayloadFromBody(requestBody(request)),
    );

    response.status(201).json({ data: result });
  }),

  learningSummary: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const [feedback, metrics] = await Promise.all([
      creativeFeedbackService.getFeedbackForCreative(id),
      creativeMetricsService.getMetricsForCreative(id),
    ]);
    const totalFeedbackScore = feedbackScore(feedback);
    const totalMetricScore = metricPerformanceScore(metrics);

    response.status(200).json({
      data: {
        creativeId: id,
        feedback,
        metrics,
        summary: {
          aggregateScore: totalFeedbackScore + totalMetricScore,
          feedbackCount: feedback.length,
          feedbackScore: totalFeedbackScore,
          metricPerformanceScore: totalMetricScore,
          metricsCount: metrics.length,
        },
      },
    });
  }),
};
