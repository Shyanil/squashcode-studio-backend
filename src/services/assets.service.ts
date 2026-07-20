import { notImplemented } from '@/utils/httpError';

export class AssetsService {
  listAssets() {
    return notImplemented('AssetsService.listAssets');
  }

  uploadAsset() {
    return notImplemented('AssetsService.uploadAsset');
  }
}

export const assetsService = new AssetsService();

