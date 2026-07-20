import { BaseRepository } from '@/repositories/base.repository';

export class HistoryRepository extends BaseRepository {
  constructor() {
    super('history');
  }
}

export const historyRepository = new HistoryRepository();

