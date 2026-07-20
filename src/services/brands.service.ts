import { notImplemented } from '@/utils/httpError';

export class BrandsService {
  listBrands() {
    return notImplemented('BrandsService.listBrands');
  }
}

export const brandsService = new BrandsService();

