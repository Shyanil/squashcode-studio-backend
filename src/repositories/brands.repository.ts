import { BaseRepository } from '@/repositories/base.repository';

export class BrandsRepository extends BaseRepository {
  constructor() {
    super('brands');
  }
}

export const brandsRepository = new BrandsRepository();

