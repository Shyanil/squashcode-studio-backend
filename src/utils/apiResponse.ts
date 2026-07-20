import type { Response } from 'express';

export function sendPlaceholder(response: Response, feature: string) {
  return response.status(501).json({
    data: null,
    message: `${feature} placeholder. Business logic is not implemented yet.`,
  });
}

export function sendHealth(response: Response) {
  return response.status(200).json({
    status: 'ok',
  });
}

