import type { ErrorRequestHandler, RequestHandler } from 'express';

import { HttpError } from '@/utils/httpError';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    message: `Route ${request.method} ${request.path} not found`,
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      message: error.message,
    });
    return;
  }

  response.status(500).json({
    message: 'Unexpected server error',
  });
};

