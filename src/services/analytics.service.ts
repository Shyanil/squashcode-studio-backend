import { notImplemented } from '@/utils/httpError';

export class AnalyticsService {
  getSummary() {
    return notImplemented('AnalyticsService.getSummary');
  }
}

export const analyticsService = new AnalyticsService();

