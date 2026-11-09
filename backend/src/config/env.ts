import dotenv from 'dotenv';

dotenv.config();

export type NodeEnv = 'development' | 'test' | 'production';

export interface DbConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  poolMin: number;
  poolMax: number;
}

export interface CorsConfig {
  origin: string;
}

export interface AuthCookieConfig {
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
}

export interface AuthRateLimitConfig {
  max: number;
  windowMs: number;
}

export interface AuthConfig {
  sessionTtl: string;
  sessionTtlMs: number;
  sessionTtlSeconds: number;
  sessionTtlMinutes: number;
  sessionTtlHours: number;
  bcryptCost: number;
  loginMaxFailures: number;
  loginWindowMinutes: number;
  loginWindowMs: number;
  ipRateLimit: AuthRateLimitConfig;
  globalRateLimit: AuthRateLimitConfig;
  recoveryEnabled: false;
  rateKey: string;
  cookie: AuthCookieConfig;
}

export interface Env {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  db: DbConfig;
  cors: CorsConfig;
  logLevel: string;
  isDev: boolean;
  isTest: boolean;
  isProd: boolean;
  auth: AuthConfig;
  session: AuthConfig;
  cookie: AuthCookieConfig;
}

const WEAK_SECRET_TOKENS = [
  'change-me',
  'changeme',
  'default',
  'secret',
  'password',
  'placeholder',
  'example',
  'test-secret',
  'sgpm_dev_password',
  'dev-only',
];

function isWeakSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return WEAK_SECRET_TOKENS.some((token) => normalized.includes(token));
}

function fail(message: string): never {
  throw new Error(message);
}

function readRaw(input: NodeJS.ProcessEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseInteger(raw: string, label: string): number {
  if (!/^-?[0-9]+$/.test(raw)) {
    fail(`Invalid ${label}: expected a strict integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    fail(`Invalid ${label}: value is not a safe integer`);
  }
  return value;
}

function requireRange(value: number, label: string, min: number, max: number): void {
  if (value < min || value > max) {
    fail(`Invalid ${label}: out of allowed range`);
  }
}

function parseBoolean(raw: string, label: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  fail(`Invalid ${label}: expected a boolean`);
}

function parseTtlToMs(raw: string): number {
  const match = raw.trim().match(/^([0-9]+)(ms|s|m|h)?$/i);
  if (!match) {
    fail('Invalid AUTH_SESSION_TTL: expected a duration such as 8h, 30m, 3600s, or 500ms');
  }
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    fail('Invalid AUTH_SESSION_TTL: amount must be a positive integer');
  }
  const unit = (match[2] || 's').toLowerCase();
  switch (unit) {
    case 'ms':
      return amount;
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    default:
      fail('Invalid AUTH_SESSION_TTL: unsupported duration unit');
  }
}

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  const nodeEnvRaw = readRaw(input, ['NODE_ENV']);
  const nodeEnv: NodeEnv =
    nodeEnvRaw === undefined || nodeEnvRaw.trim() === ''
      ? 'development'
      : nodeEnvRaw.trim() === 'development' ||
        nodeEnvRaw.trim() === 'test' ||
        nodeEnvRaw.trim() === 'production'
      ? (nodeEnvRaw.trim() as NodeEnv)
      : fail('Invalid NODE_ENV: expected development, test, or production');

  const isDev = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';
  const isProd = nodeEnv === 'production';

  // PORT
  const portRaw = readRaw(input, ['PORT']);
  const port = portRaw === undefined ? 3000 : parseInteger(portRaw, 'PORT');
  requireRange(port, 'PORT', 1, 65535);

  // HOST
  const hostRaw = readRaw(input, ['HOST']);
  const host = hostRaw === undefined || hostRaw.trim() === '' ? '0.0.0.0' : hostRaw;

  // DB
  const dbHostRaw = readRaw(input, ['DB_HOST']);
  let dbHost: string;
  if (dbHostRaw === undefined) {
    if (isProd) {
      fail('Missing required environment variable: DB_HOST');
    }
    dbHost = 'localhost';
  } else {
    dbHost = dbHostRaw;
  }
  if (dbHost.trim() === '') {
    fail('Invalid DB_HOST: value cannot be empty');
  }

  const dbPortRaw = readRaw(input, ['DB_PORT']);
  const dbPort = dbPortRaw === undefined ? 5432 : parseInteger(dbPortRaw, 'DB_PORT');
  requireRange(dbPort, 'DB_PORT', 1, 65535);

  const dbNameRaw = readRaw(input, ['DB_NAME']);
  let dbName: string;
  if (dbNameRaw === undefined) {
    if (isProd) {
      fail('Missing required environment variable: DB_NAME');
    }
    dbName = 'sgpm_dev';
  } else {
    dbName = dbNameRaw;
  }
  if (dbName.trim() === '') {
    fail('Invalid DB_NAME: value cannot be empty');
  }

  const dbUserRaw = readRaw(input, ['DB_USER']);
  let dbUser: string;
  if (dbUserRaw === undefined) {
    if (isProd) {
      fail('Missing required environment variable: DB_USER');
    }
    dbUser = 'sgpm_user';
  } else {
    dbUser = dbUserRaw;
  }
  if (dbUser.trim() === '') {
    fail('Invalid DB_USER: value cannot be empty');
  }

  const dbPasswordRaw = readRaw(input, ['DB_PASSWORD']);
  let dbPassword: string;
  if (dbPasswordRaw === undefined) {
    if (isProd) {
      fail('Missing required environment variable: DB_PASSWORD');
    }
    dbPassword = 'sgpm_dev_password';
  } else {
    dbPassword = dbPasswordRaw;
  }
  if (dbPassword.trim() === '') {
    fail('Invalid DB_PASSWORD: value cannot be empty');
  }
  if (isProd && (dbPassword === 'sgpm_dev_password' || isWeakSecret(dbPassword))) {
    fail('Invalid DB_PASSWORD: default or weak database password is not allowed in production');
  }

  const poolMinRaw = readRaw(input, ['DB_POOL_MIN']);
  const poolMin = poolMinRaw === undefined ? 2 : parseInteger(poolMinRaw, 'DB_POOL_MIN');
  requireRange(poolMin, 'DB_POOL_MIN', 0, 100);

  const poolMaxRaw = readRaw(input, ['DB_POOL_MAX']);
  const poolMax = poolMaxRaw === undefined ? 10 : parseInteger(poolMaxRaw, 'DB_POOL_MAX');
  requireRange(poolMax, 'DB_POOL_MAX', 1, 100);

  if (poolMin > poolMax) {
    fail('Invalid DB pool configuration: poolMin must be less than or equal to poolMax');
  }

  // CORS
  const corsOriginRaw = readRaw(input, ['CORS_ORIGIN']);
  let corsOrigin: string;
  if (corsOriginRaw === undefined) {
    if (isProd) {
      fail('Missing required environment variable: CORS_ORIGIN');
    }
    corsOrigin = 'http://localhost:5173';
  } else {
    corsOrigin = corsOriginRaw;
  }
  if (corsOrigin.trim() === '') {
    fail('Invalid CORS_ORIGIN: value cannot be empty');
  }
  if (corsOrigin.includes(',')) {
    fail('Invalid CORS_ORIGIN: only a single origin is allowed');
  }
  if (corsOrigin.includes('*')) {
    fail('Invalid CORS_ORIGIN: wildcard origins are not allowed');
  }
  let parsedCorsOrigin: URL;
  try {
    parsedCorsOrigin = new URL(corsOrigin);
  } catch {
    fail('Invalid CORS_ORIGIN: expected a valid URL');
  }
  if (
    parsedCorsOrigin.protocol !== 'http:' &&
    parsedCorsOrigin.protocol !== 'https:'
  ) {
    fail('Invalid CORS_ORIGIN: expected an http or https origin');
  }
  if (parsedCorsOrigin.username !== '' || parsedCorsOrigin.password !== '') {
    fail('Invalid CORS_ORIGIN: userinfo is not allowed');
  }
  if (parsedCorsOrigin.pathname !== '/' && parsedCorsOrigin.pathname !== '') {
    fail('Invalid CORS_ORIGIN: path is not allowed');
  }
  if (parsedCorsOrigin.search !== '') {
    fail('Invalid CORS_ORIGIN: query string is not allowed');
  }
  if (parsedCorsOrigin.hash !== '') {
    fail('Invalid CORS_ORIGIN: fragment is not allowed');
  }
  if (isProd && parsedCorsOrigin.protocol !== 'https:') {
    fail('Invalid CORS_ORIGIN: HTTPS is required in production');
  }

  // LOG LEVEL
  const logLevelRaw = readRaw(input, ['LOG_LEVEL']);
  const logLevel = logLevelRaw === undefined || logLevelRaw.trim() === '' ? 'info' : logLevelRaw;

  // AUTH SESSION TTL
  const ttlMsRaw = readRaw(input, ['AUTH_SESSION_TTL_MS', 'SESSION_TTL_MS']);
  const ttlSecondsRaw = readRaw(input, ['AUTH_SESSION_TTL_SECONDS', 'SESSION_TTL_SECONDS']);
  const ttlMinutesRaw = readRaw(input, ['AUTH_SESSION_TTL_MINUTES', 'SESSION_TTL_MINUTES']);
  const ttlHoursRaw = readRaw(input, ['AUTH_SESSION_TTL_HOURS', 'SESSION_TTL_HOURS']);
  const ttlGenericRaw = readRaw(input, [
    'AUTH_SESSION_TTL',
    'SESSION_TTL',
    'AUTH_SESSION_EXPIRES_IN',
    'SESSION_EXPIRES_IN',
  ]);

  let sessionTtl: string;
  let sessionTtlMs: number;

  if (ttlMsRaw !== undefined) {
    sessionTtlMs = parseInteger(ttlMsRaw, 'AUTH_SESSION_TTL_MS');
    sessionTtl = `${ttlMsRaw}ms`;
  } else if (ttlSecondsRaw !== undefined) {
    sessionTtlMs = parseInteger(ttlSecondsRaw, 'AUTH_SESSION_TTL_SECONDS') * 1000;
    sessionTtl = `${ttlSecondsRaw}s`;
  } else if (ttlMinutesRaw !== undefined) {
    sessionTtlMs = parseInteger(ttlMinutesRaw, 'AUTH_SESSION_TTL_MINUTES') * 60 * 1000;
    sessionTtl = `${ttlMinutesRaw}m`;
  } else if (ttlHoursRaw !== undefined) {
    sessionTtlMs = parseInteger(ttlHoursRaw, 'AUTH_SESSION_TTL_HOURS') * 60 * 60 * 1000;
    sessionTtl = `${ttlHoursRaw}h`;
  } else if (ttlGenericRaw !== undefined) {
    sessionTtl = ttlGenericRaw;
    sessionTtlMs = parseTtlToMs(ttlGenericRaw);
  } else {
    sessionTtl = '8h';
    sessionTtlMs = parseTtlToMs('8h');
  }

  const MIN_SESSION_TTL_MS = 5 * 60 * 1000;
  const MAX_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  if (sessionTtlMs < MIN_SESSION_TTL_MS || sessionTtlMs > MAX_SESSION_TTL_MS) {
    fail('Invalid AUTH_SESSION_TTL: duration is out of allowed range');
  }

  // BCRYPT COST
  const bcryptCostRaw = readRaw(input, [
    'AUTH_BCRYPT_COST',
    'BCRYPT_COST',
    'BCRYPT_ROUNDS',
    'AUTH_BCRYPT_ROUNDS',
  ]);
  const bcryptCost =
    bcryptCostRaw === undefined ? 12 : parseInteger(bcryptCostRaw, 'AUTH_BCRYPT_COST');
  requireRange(bcryptCost, 'AUTH_BCRYPT_COST', 12, 14);

  // LOGIN LIMITS
  const loginMaxFailuresRaw = readRaw(input, [
    'AUTH_LOGIN_MAX_FAILURES',
    'LOGIN_MAX_FAILURES',
    'AUTH_MAX_LOGIN_ATTEMPTS',
  ]);
  const loginMaxFailures =
    loginMaxFailuresRaw === undefined
      ? 5
      : parseInteger(loginMaxFailuresRaw, 'AUTH_LOGIN_MAX_FAILURES');
  requireRange(loginMaxFailures, 'AUTH_LOGIN_MAX_FAILURES', 1, 20);

  const loginWindowMinutesRaw = readRaw(input, [
    'AUTH_LOGIN_WINDOW_MINUTES',
    'LOGIN_WINDOW_MINUTES',
    'AUTH_LOGIN_WINDOW',
  ]);
  const loginWindowMinutes =
    loginWindowMinutesRaw === undefined
      ? 15
      : parseInteger(loginWindowMinutesRaw, 'AUTH_LOGIN_WINDOW_MINUTES');
  requireRange(loginWindowMinutes, 'AUTH_LOGIN_WINDOW_MINUTES', 1, 60);

  // IP RATE LIMIT
  const ipRateLimitMaxRaw = readRaw(input, [
    'AUTH_IP_RATE_LIMIT_MAX',
    'AUTH_IP_RATE_LIMIT',
    'IP_RATE_LIMIT_MAX',
    'IP_RATE_LIMIT',
  ]);
  const ipRateLimitMax =
    ipRateLimitMaxRaw === undefined ? 10 : parseInteger(ipRateLimitMaxRaw, 'AUTH_IP_RATE_LIMIT_MAX');
  requireRange(ipRateLimitMax, 'AUTH_IP_RATE_LIMIT_MAX', 1, 10000);

  const ipRateLimitWindowRaw = readRaw(input, [
    'AUTH_IP_RATE_LIMIT_WINDOW_MINUTES',
    'AUTH_IP_RATE_LIMIT_WINDOW',
    'IP_RATE_LIMIT_WINDOW_MINUTES',
  ]);
  const ipRateLimitWindowMinutes =
    ipRateLimitWindowRaw === undefined ? 15 : parseInteger(ipRateLimitWindowRaw, 'AUTH_IP_RATE_LIMIT_WINDOW_MINUTES');
  requireRange(ipRateLimitWindowMinutes, 'AUTH_IP_RATE_LIMIT_WINDOW_MINUTES', 1, 60);

  // GLOBAL RATE LIMIT
  const globalRateLimitMaxRaw = readRaw(input, [
    'AUTH_GLOBAL_RATE_LIMIT_MAX',
    'AUTH_GLOBAL_RATE_LIMIT',
    'GLOBAL_RATE_LIMIT_MAX',
    'GLOBAL_RATE_LIMIT',
  ]);
  const globalRateLimitMax =
    globalRateLimitMaxRaw === undefined ? 100 : parseInteger(globalRateLimitMaxRaw, 'AUTH_GLOBAL_RATE_LIMIT_MAX');
  requireRange(globalRateLimitMax, 'AUTH_GLOBAL_RATE_LIMIT_MAX', 1, 100000);

  const globalRateLimitWindowRaw = readRaw(input, [
    'AUTH_GLOBAL_RATE_LIMIT_WINDOW_MINUTES',
    'AUTH_GLOBAL_RATE_LIMIT_WINDOW',
    'GLOBAL_RATE_LIMIT_WINDOW_MINUTES',
  ]);
  const globalRateLimitWindowMinutes =
    globalRateLimitWindowRaw === undefined
      ? 15
      : parseInteger(globalRateLimitWindowRaw, 'AUTH_GLOBAL_RATE_LIMIT_WINDOW_MINUTES');
  requireRange(globalRateLimitWindowMinutes, 'AUTH_GLOBAL_RATE_LIMIT_WINDOW_MINUTES', 1, 60);

  // RECOVERY (always disabled)
  const recoveryRaw = readRaw(input, [
    'AUTH_RECOVERY_ENABLED',
    'PASSWORD_RECOVERY_ENABLED',
    'RECOVERY_ENABLED',
  ]);
  if (recoveryRaw !== undefined && recoveryRaw.trim() !== '') {
    const normalized = recoveryRaw.trim().toLowerCase();
    if (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes' ||
      normalized === 'on'
    ) {
      fail('Password recovery is not available in this release');
    }
  }

  // RATE KEY
  const rateKeyRaw = readRaw(input, [
    'AUTH_RATE_KEY',
    'AUTH_RATE_LIMIT_KEY',
    'RATE_LIMIT_KEY',
  ]);
  let rateKey: string;
  if (rateKeyRaw === undefined) {
    if (isProd) {
      fail('Missing required environment variable: AUTH_RATE_KEY');
    }
    rateKey = 'dev-only-auth-rate-key-not-for-production-0123456789';
  } else {
    rateKey = rateKeyRaw;
    if (rateKey.trim() === '') {
      fail('Invalid AUTH_RATE_KEY: value cannot be empty');
    }
    if (isWeakSecret(rateKey) || Buffer.byteLength(rateKey, 'utf8') < 32) {
      fail('Invalid AUTH_RATE_KEY: key must be at least 32 bytes and not a known weak value');
    }
  }
  if (isProd && isWeakSecret(rateKey)) {
    fail('Invalid AUTH_RATE_KEY: weak keys are not allowed in production');
  }

  // COOKIE
  const sameSiteRaw = readRaw(input, [
    'AUTH_COOKIE_SAME_SITE',
    'COOKIE_SAME_SITE',
    'SESSION_COOKIE_SAME_SITE',
  ]);
  let sameSite: 'lax' | 'strict' | 'none' = 'lax';
  if (sameSiteRaw !== undefined && sameSiteRaw.trim() !== '') {
    const normalized = sameSiteRaw.trim().toLowerCase();
    if (normalized !== 'lax' && normalized !== 'strict' && normalized !== 'none') {
      fail('Invalid cookie sameSite value');
    }
    sameSite = normalized as 'lax' | 'strict' | 'none';
  }

  const secureRaw = readRaw(input, ['AUTH_COOKIE_SECURE', 'COOKIE_SECURE', 'SESSION_COOKIE_SECURE']);
  let secure: boolean;
  if (secureRaw === undefined) {
    secure = isProd;
  } else {
    secure = parseBoolean(secureRaw, 'AUTH_COOKIE_SECURE');
  }
  if (isProd && !secure) {
    fail('Invalid auth cookie: secure is required in production');
  }

  const httpOnlyRaw = readRaw(input, ['AUTH_COOKIE_HTTP_ONLY', 'COOKIE_HTTP_ONLY', 'SESSION_COOKIE_HTTP_ONLY']);
  let httpOnly = true;
  if (httpOnlyRaw !== undefined && httpOnlyRaw.trim() !== '') {
    const parsed = parseBoolean(httpOnlyRaw, 'AUTH_COOKIE_HTTP_ONLY');
    if (!parsed) {
      fail('Invalid auth cookie: httpOnly cannot be disabled');
    }
    httpOnly = true;
  }

  if (sameSite === 'none' && !secure) {
    fail('Invalid auth cookie: sameSite none requires secure');
  }

  const cookie: AuthCookieConfig = {
    secure,
    httpOnly,
    sameSite,
  };

  const auth: AuthConfig = {
    sessionTtl,
    sessionTtlMs,
    sessionTtlSeconds: Math.floor(sessionTtlMs / 1000),
    sessionTtlMinutes: sessionTtlMs / (60 * 1000),
    sessionTtlHours: sessionTtlMs / (60 * 60 * 1000),
    bcryptCost,
    loginMaxFailures,
    loginWindowMinutes,
    loginWindowMs: loginWindowMinutes * 60 * 1000,
    ipRateLimit: {
      max: ipRateLimitMax,
      windowMs: ipRateLimitWindowMinutes * 60 * 1000,
    },
    globalRateLimit: {
      max: globalRateLimitMax,
      windowMs: globalRateLimitWindowMinutes * 60 * 1000,
    },
    recoveryEnabled: false,
    rateKey,
    cookie,
  };

  return {
    nodeEnv,
    port,
    host,
    db: {
      host: dbHost,
      port: dbPort,
      name: dbName,
      user: dbUser,
      password: dbPassword,
      poolMin,
      poolMax,
    },
    cors: {
      origin: corsOrigin,
    },
    logLevel,
    isDev,
    isTest,
    isProd,
    auth,
    session: auth,
    cookie,
  };
}

export const env = parseEnv(process.env);