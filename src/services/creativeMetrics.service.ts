import { randomUUID } from 'crypto';

import { supabaseClient } from '@/supabase/client';
import type { JsonObject } from '@/services/creativeFeedback.service';
import { HttpError } from '@/utils/httpError';

export interface CreativeMetricsPayload {
  platform?: string;
  campaignName?: string;
  impressions?: number;
  reach?: number;
  clicks?: number;
  conversions?: number;
  spend?: number;
  revenue?: number;
  ctr?: number;
  conversionRate?: number;
  rawMetrics?: JsonObject;
  capturedAt?: string;
}

export interface CreativeMetrics {
  id: string;
  creativeId: string;
  userId: string;
  platform?: string | null;
  campaignName?: string | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  spend?: number | null;
  revenue?: number | null;
  ctr?: number | null;
  conversionRate?: number | null;
  rawMetrics: JsonObject;
  capturedAt: string;
  createdAt: string;
}

interface NormalizedMetricsPayload {
  platform: string | null;
  campaignName: string | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  conversions: number | null;
  spend: number | null;
  revenue: number | null;
  ctr: number | null;
  conversionRate: number | null;
  rawMetrics: JsonObject;
  capturedAt: string;
}

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

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sanitizeInteger(value: unknown): number | null {
  const numberValue = asNumber(value);

  if (numberValue === null) {
    return null;
  }

  return Math.max(0, Math.round(numberValue));
}

function sanitizeNumber(value: unknown): number | null {
  const numberValue = asNumber(value);
  return numberValue === null ? null : Math.max(0, numberValue);
}

function mapMetricsRow(row: Record<string, unknown>): CreativeMetrics {
  return {
    id: asString(row.id) ?? '',
    creativeId: asString(row.creative_id) ?? '',
    userId: asString(row.user_id) ?? '',
    platform: asNullableString(row.platform),
    campaignName: asNullableString(row.campaign_name),
    impressions: asNumber(row.impressions),
    reach: asNumber(row.reach),
    clicks: asNumber(row.clicks),
    conversions: asNumber(row.conversions),
    spend: asNumber(row.spend),
    revenue: asNumber(row.revenue),
    ctr: asNumber(row.ctr),
    conversionRate: asNumber(row.conversion_rate),
    rawMetrics: asRecord(row.raw_metrics),
    capturedAt: asString(row.captured_at) ?? new Date().toISOString(),
    createdAt: asString(row.created_at) ?? new Date().toISOString(),
  };
}

function normalizeMetricsPayload(payload: CreativeMetricsPayload): NormalizedMetricsPayload {
  const impressions = sanitizeInteger(payload.impressions);
  const clicks = sanitizeInteger(payload.clicks);
  const conversions = sanitizeInteger(payload.conversions);
  const computedCtr =
    payload.ctr ?? (impressions !== null && clicks !== null && impressions > 0 ? (clicks / impressions) * 100 : undefined);
  const computedConversionRate =
    payload.conversionRate ?? (clicks !== null && conversions !== null && clicks > 0 ? (conversions / clicks) * 100 : undefined);

  return {
    campaignName: asString(payload.campaignName) ?? null,
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    clicks,
    conversionRate: sanitizeNumber(computedConversionRate),
    conversions,
    ctr: sanitizeNumber(computedCtr),
    impressions,
    platform: asString(payload.platform) ?? null,
    rawMetrics: payload.rawMetrics ?? {},
    reach: sanitizeInteger(payload.reach),
    revenue: sanitizeNumber(payload.revenue),
    spend: sanitizeNumber(payload.spend),
  };
}

export class CreativeMetricsService {
  private readonly metrics = new Map<string, CreativeMetrics[]>();

  async recordMetrics(
    creativeId: string,
    userId: string,
    metricsPayload: CreativeMetricsPayload,
  ): Promise<CreativeMetrics> {
    const payload = normalizeMetricsPayload(metricsPayload);
    const createdAt = new Date().toISOString();

    const metrics: CreativeMetrics = {
      id: randomUUID(),
      creativeId,
      userId,
      platform: payload.platform,
      campaignName: payload.campaignName,
      impressions: payload.impressions,
      reach: payload.reach,
      clicks: payload.clicks,
      conversions: payload.conversions,
      spend: payload.spend,
      revenue: payload.revenue,
      ctr: payload.ctr,
      conversionRate: payload.conversionRate,
      rawMetrics: payload.rawMetrics,
      capturedAt: payload.capturedAt,
      createdAt,
    };

    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('creative_metrics')
        .insert({
          id: metrics.id,
          creative_id: metrics.creativeId,
          user_id: metrics.userId,
          platform: metrics.platform,
          campaign_name: metrics.campaignName,
          impressions: metrics.impressions,
          reach: metrics.reach,
          clicks: metrics.clicks,
          conversions: metrics.conversions,
          spend: metrics.spend,
          revenue: metrics.revenue,
          ctr: metrics.ctr,
          conversion_rate: metrics.conversionRate,
          raw_metrics: metrics.rawMetrics,
          captured_at: metrics.capturedAt,
          created_at: metrics.createdAt,
        })
        .select()
        .single();

      if (error) {
        throw new HttpError(502, `Supabase creative metrics create failed: ${error.message}`);
      }

      if (data) {
        const saved = mapMetricsRow(data as Record<string, unknown>);
        const list = this.metrics.get(creativeId) ?? [];
        this.metrics.set(creativeId, [saved, ...list]);
        return saved;
      }
    }

    const list = this.metrics.get(creativeId) ?? [];
    this.metrics.set(creativeId, [metrics, ...list]);

    return metrics;
  }

  async getMetricsForCreative(creativeId: string): Promise<CreativeMetrics[]> {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('creative_metrics')
        .select('*')
        .eq('creative_id', creativeId)
        .order('captured_at', { ascending: false });

      if (error) {
        throw new HttpError(502, `Supabase creative metrics list failed: ${error.message}`);
      }

      if (data) {
        return (data as Record<string, unknown>[]).map(mapMetricsRow);
      }
    }

    return this.metrics.get(creativeId) ?? [];
  }
}

export const creativeMetricsService = new CreativeMetricsService();
