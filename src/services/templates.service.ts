import { notImplemented } from '@/utils/httpError';

export class TemplatesService {
  listTemplates() {
    return notImplemented('TemplatesService.listTemplates');
  }
}

export const templatesService = new TemplatesService();

