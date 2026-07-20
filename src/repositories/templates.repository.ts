import { BaseRepository } from '@/repositories/base.repository';

export class TemplatesRepository extends BaseRepository {
  constructor() {
    super('templates');
  }
}

export const templatesRepository = new TemplatesRepository();

