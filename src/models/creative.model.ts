export interface CreativeModel {
  createdAt: string;
  id: string;
  imageUrl?: string;
  promptId?: string;
  status: 'draft' | 'generated' | 'approved' | 'archived';
  title: string;
}

