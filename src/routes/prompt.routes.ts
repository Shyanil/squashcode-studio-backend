import { Router } from 'express';

import { promptController } from '@/controllers/prompt.controller';

export const promptRouter = Router();

promptRouter.get('/sessions', promptController.listSessions);
promptRouter.get('/generations', promptController.listGenerations);
promptRouter.post('/sessions', promptController.createSession);
promptRouter.get('/sessions/:sessionId', promptController.getSession);
promptRouter.post('/sessions/:sessionId/image', promptController.analyzeImage);
promptRouter.post('/sessions/:sessionId/assets', promptController.addAsset);
promptRouter.post('/sessions/:sessionId/messages', promptController.sendMessage);
promptRouter.post('/sessions/:sessionId/generate-json', promptController.generateSessionJson);
promptRouter.post('/json', promptController.generateJson);
promptRouter.post('/enhance', promptController.enhance);
