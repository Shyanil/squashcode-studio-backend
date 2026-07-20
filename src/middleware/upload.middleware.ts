import { upload } from '@/storage/multer.config';

export const uploadSingleAsset = upload.single('file');

