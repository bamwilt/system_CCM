import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env';
import healthRoutes from './routes/health';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: env.cors.origin, credentials: true }));

// Parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan(env.isDev ? 'dev' : 'combined'));

// Routes
app.use('/api', healthRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

export default app;
