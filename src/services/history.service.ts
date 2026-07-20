import { notImplemented } from '@/utils/httpError';

export class HistoryService {
  listHistory() {
    return notImplemented('HistoryService.listHistory');
  }
}

export const historyService = new HistoryService();

