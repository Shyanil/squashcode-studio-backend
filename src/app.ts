import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { corsOptions } from '@/config/cors';
import { errorHandler, notFoundHandler } from '@/middleware/error.middleware';
import { apiRouter } from '@/routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(morgan('dev'));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'creative-studio-api' });
  });

  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
