import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOST', '0.0.0.0'),
  db: {
    host: optional('DB_HOST', 'localhost'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    name: optional('DB_NAME', 'sgpm_dev'),
    user: optional('DB_USER', 'sgpm_user'),
    password: optional('DB_PASSWORD', 'sgpm_dev_password'),
    poolMin: parseInt(optional('DB_POOL_MIN', '2'), 10),
    poolMax: parseInt(optional('DB_POOL_MAX', '10'), 10),
  },
  jwt: {
    secret: optional('JWT_SECRET', 'change-me-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
  },
  cors: {
    origin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  },
  logLevel: optional('LOG_LEVEL', 'info'),
  isDev: optional('NODE_ENV', 'development') === 'development',
  isProd: optional('NODE_ENV', 'development') === 'production',
} as const;
