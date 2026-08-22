import { Router } from 'express';

import { analyticsRouter } from '@/routes/analytics.routes';
import { assetsRouter } from '@/routes/assets.routes';
import { authRouter } from '@/routes/auth.routes';
import { brandsRouter } from '@/routes/brands.routes';
import { creativeRouter } from '@/routes/creative.routes';
import { creativeFoldersRouter } from '@/routes/creativeFolders.routes';
import { historyRouter } from '@/routes/history.routes';
import { promptRouter } from '@/routes/prompt.routes';
import { settingsRouter } from '@/routes/settings.routes';
import { templatesRouter } from '@/routes/templates.routes';
import { usersRouter } from '@/routes/users.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/brands', brandsRouter);
apiRouter.use('/prompt', promptRouter);
// Mounted before /creative so GET /creative/folders is not swallowed by /creative/:id.
apiRouter.use('/creative/folders', creativeFoldersRouter);
apiRouter.use('/creative', creativeRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/templates', templatesRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/history', historyRouter);

