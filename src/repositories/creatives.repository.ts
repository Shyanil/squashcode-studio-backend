import { BaseRepository } from '@/repositories/base.repository';

export class CreativesRepository extends BaseRepository {
  constructor() {
    super('creatives');
  }
}

export const creativesRepository = new CreativesRepository();

