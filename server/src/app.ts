import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOrigins, isProd } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { modulosRouter } from './routes/modulos.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { catalogosRouter } from './routes/catalogos.routes.js';
import { requiereAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { checkDb } from './db/pool.js';

export function crearApp(): express.Express {
  const app = express();

  // Behind a proxy (nginx, Vite dev server): hace que req.ip refleje la IP real.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins.length === 0 ? true : corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (!isProd) app.use(morgan('dev'));

  // --- Salud --------------------------------------------------------------
  app.get('/api/health', async (_req, res) => {
    const dbOk = await checkDb();
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degradado',
      baseDeDatos: dbOk ? 'conectada' : 'sin conexión',
      entorno: process.env['NODE_ENV'] ?? 'development',
      hora: new Date().toISOString(),
    });
  });

  // --- API ----------------------------------------------------------------
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/catalogos', catalogosRouter);
  app.use('/api', requiereAuth, modulosRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
