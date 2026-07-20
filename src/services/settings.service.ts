import { notImplemented } from '@/utils/httpError';

export class SettingsService {
  getSettings() {
    return notImplemented('SettingsService.getSettings');
  }
}

export const settingsService = new SettingsService();

