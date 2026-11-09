import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const TOKEN_BYTES = 32;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;
export const BCRYPT_COST_MIN = 12;
export const BCRYPT_COST_MAX = 14;
export const DEFAULT_BCRYPT_COST = 12;

export type TokenEncoding = 'hex' | 'base64url';

export function generateToken(encoding: TokenEncoding = 'hex'): string {
  const bytes = crypto.randomBytes(TOKEN_BYTES);
  return encoding === 'base64url' ? bytes.toString('base64url') : bytes.toString('hex');
}

export function generateSecureToken(encoding: TokenEncoding = 'hex'): string {
  return generateToken(encoding);
}

export function generateSessionToken(): string {
  return generateToken('hex');
}

export function generateCsrfToken(): string {
  return generateToken('hex');
}

export const createToken = generateToken;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export const hashTokenSha256 = hashToken;
export const sha256Hex = hashToken;

export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export const safeCompare = constantTimeCompare;
export const timingSafeEqualStrings = constantTimeCompare;

export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, 'utf8');
}

export function isPasswordValid(password: string): boolean {
  return (
    typeof password === 'string' &&
    password.length >= MIN_PASSWORD_LENGTH &&
    Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES
  );
}

export function assertPasswordValid(password: string): void {
  if (!isPasswordValid(password)) {
    throw new Error('Invalid password: must be at least 12 characters and no more than 72 UTF-8 bytes');
  }
}

export function isValidPasswordHash(hash: string): boolean {
  if (typeof hash !== 'string' || hash.length !== 60) {
    return false;
  }
  const match = hash.match(/^\$2([aby])\$(\d{2})\$/);
  if (!match) {
    return false;
  }
  const cost = Number(match[2]);
  if (!Number.isInteger(cost) || cost < BCRYPT_COST_MIN || cost > BCRYPT_COST_MAX) {
    return false;
  }
  if (/placeholder|change-me|default|example/i.test(hash)) {
    return false;
  }
  return true;
}

export function assertPasswordHashValid(hash: string): void {
  if (!isValidPasswordHash(hash)) {
    throw new Error('Invalid password hash format or cost');
  }
}

export async function hashPassword(password: string, cost: number = DEFAULT_BCRYPT_COST): Promise<string> {
  assertPasswordValid(password);
  if (cost < BCRYPT_COST_MIN || cost > BCRYPT_COST_MAX) {
    throw new Error('Invalid bcrypt cost');
  }
  const hash = await bcrypt.hash(password, cost);
  if (!isValidPasswordHash(hash)) {
    throw new Error('Generated password hash failed validation');
  }
  return hash;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!isPasswordValid(password) || !isValidPasswordHash(hash)) {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

let dummyPasswordHashCache: string | null = null;

export function getDummyPasswordHash(): string {
  if (dummyPasswordHashCache === null) {
    dummyPasswordHashCache = bcrypt.hashSync(crypto.randomBytes(TOKEN_BYTES).toString('base64url'), DEFAULT_BCRYPT_COST);
  }
  return dummyPasswordHashCache;
}

export const dummyPasswordHash = getDummyPasswordHash();

export type RateBucketPrefix = string;

export function rateBucketKey(...args: unknown[]): string {
  let prefix = 'identity';
  let value = '';
  let secret: string | Buffer | undefined;

  for (const arg of args) {
    if (arg !== null && typeof arg === 'object' && !Buffer.isBuffer(arg)) {
      const obj = arg as Record<string, unknown>;
      if (typeof obj.prefix === 'string') prefix = obj.prefix;
      if (typeof obj.value === 'string') value = obj.value;
      if (typeof obj.identifier === 'string') value = obj.identifier;
      if (typeof obj.raw === 'string') value = obj.raw;
      if (typeof obj.secret === 'string' || Buffer.isBuffer(obj.secret)) {
        secret = obj.secret as string | Buffer;
      }
      if (typeof obj.key === 'string' || Buffer.isBuffer(obj.key)) {
        secret = obj.key as string | Buffer;
      }
      continue;
    }

    if (typeof arg === 'string') {
      if (arg === 'identity' || arg === 'ip' || arg === 'global') {
        prefix = arg;
      } else if (secret === undefined && (arg.length >= 32 || /rate|secret|key/i.test(arg))) {
        secret = arg;
      } else if (value === '') {
        value = arg;
      } else if (secret === undefined) {
        secret = arg;
      } else {
        value = arg;
      }
      continue;
    }

    if (Buffer.isBuffer(arg)) {
      secret = arg;
    }
  }

  if (prefix.trim() === '') {
    throw new Error('Invalid rate bucket prefix');
  }
  if (value.trim() === '') {
    throw new Error('Missing rate bucket value');
  }
  if (secret === undefined) {
    throw new Error('Missing rate bucket secret');
  }

  return crypto.createHmac('sha256', secret).update(`${prefix}\u0000${value}`, 'utf8').digest('hex');
}

export const bucketKey = rateBucketKey;
export const hmacRateBucketKey = rateBucketKey;
export const createRateBucketKey = rateBucketKey;
export const hashRateBucketKey = rateBucketKey;