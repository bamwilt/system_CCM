import { Router, Request, Response } from 'express';
import { testConnection } from '../config/database';
import { env } from '../config/env';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv,
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();
  if (dbConnected) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, reason: 'database not available' });
  }
});

export default router;
