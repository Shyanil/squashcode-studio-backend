import type { Request, Response } from 'express';
import { creativeService } from '@/services/creative.service';
import { asyncHandler } from '@/utils/asyncHandler';
import { supabaseClient } from '@/supabase/client';

function requestUserId(request: Request) {
  const headerUserId = request.header('x-user-id');
  return headerUserId ?? undefined;
}

export const creativeController = {
  generate: asyncHandler(async (request: Request, response: Response) => {
    const userId = requestUserId(request);
    const body = request.body || {};
    const result = await creativeService.generateCreative({
      userId,
      title: typeof body.title === 'string' ? body.title : 'New Visual Concept',
      brand: body.brand,
      campaign: body.campaign,
      tags: body.tags,
      aspectRatio: body.aspectRatio,
      quality: body.quality,
      imageCount: body.imageCount,
      promptGenerationId: body.promptGenerationId,
      referenceImageUrl: body.referenceImageUrl,
    });
    response.status(200).json({ data: result });
  }),

  list: asyncHandler(async (request: Request, response: Response) => {
    const userId = requestUserId(request);
    const result = await creativeService.listCreatives(userId);
    response.status(200).json({ data: result });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    await creativeService.deleteCreative({ id, userId: requestUserId(request) });

    response.status(200).json({ data: true });
  }),

  toggleFavorite: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;

    let updated = null;
    if (supabaseClient) {
      // Fetch current favorite state
      const { data } = await supabaseClient
        .from('creatives')
        .select('favorite')
        .eq('id', id)
        .single();

      if (data) {
        const nextFav = !data.favorite;
        const { data: updatedData } = await supabaseClient
          .from('creatives')
          .update({ favorite: nextFav })
          .eq('id', id)
          .select()
          .single();

        if (updatedData) {
          updated = {
            id: updatedData.id,
            userId: updatedData.user_id,
            title: updatedData.title,
            brand: updatedData.brand,
            campaign: updatedData.campaign,
            tags: updatedData.tags,
            date: updatedData.date,
            aspectRatio: updatedData.aspect_ratio,
            variant: updatedData.variant,
            favorite: updatedData.favorite,
            imageUrl: updatedData.image_url,
          };
        }
      }
    }

    response.status(200).json({ data: updated });
  }),
};
