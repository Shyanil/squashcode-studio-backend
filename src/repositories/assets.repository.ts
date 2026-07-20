import { BaseRepository } from '@/repositories/base.repository';

export class AssetsRepository extends BaseRepository {
  constructor() {
    super('assets');
  }
}

export const assetsRepository = new AssetsRepository();

