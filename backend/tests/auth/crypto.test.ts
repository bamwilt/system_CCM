import { vi, describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  TOKEN_BYTES,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  BCRYPT_COST_MIN,
  BCRYPT_COST_MAX,
  DEFAULT_BCRYPT_COST,
  generateToken,
  generateSecureToken,
  generateSessionToken,
  generateCsrfToken,
  createToken,
  hashToken,
  hashTokenSha256,
  sha256Hex,
  constantTimeCompare,
  safeCompare,
  timingSafeEqualStrings,
  passwordByteLength,
  isPasswordValid,
  assertPasswordValid,
  isValidPasswordHash,
  assertPasswordHashValid,
  hashPassword,
  verifyPassword,
  getDummyPasswordHash,
  dummyPasswordHash,
  rateBucketKey,
  bucketKey,
  hmacRateBucketKey,
  createRateBucketKey,
  hashRateBucketKey,
} from '../../src/utils/authCrypto';

import { redact, redactError, redactValue, redactObject, sanitizeError, REDACTED_VALUE } from '../../src/utils/redact';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

describe('authCrypto - token generation and hashing', () => {
  it('generates 32-byte tokens (hex length 64)', () => {
    for (const fn of [generateToken, generateSecureToken, generateSessionToken, generateCsrfToken, createToken]) {
      const value = (fn as () => string)();
      expect(Buffer.from(value, 'hex')).toHaveLength(TOKEN_BYTES);
      expect(value).toHaveLength(TOKEN_BYTES * 2);
    }
  });

  it('supports base64url encoding with 32 bytes', () => {
    const value = generateToken('base64url');
    expect(Buffer.from(value, 'base64url')).toHaveLength(TOKEN_BYTES);
  });

  it('hashToken is SHA-256 hex', () => {
    const input = 'sample-token';
    expect(hashToken(input)).toBe(crypto.createHash('sha256').update(input, 'utf8').digest('hex'));
    expect(hashTokenSha256(input)).toBe(hashToken(input));
    expect(sha256Hex(input)).toBe(hashToken(input));
    expect(hashToken(input)).toHaveLength(64);
  });
});

describe('authCrypto - constant-time compare', () => {
  it('returns true only for identical strings', () => {
    expect(constantTimeCompare('abc', 'abc')).toBe(true);
    expect(safeCompare('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
  });
  it('returns false for different content or length', () => {
    expect(constantTimeCompare('abc', 'abd')).toBe(false);
    expect(constantTimeCompare('abc', 'abcd')).toBe(false);
    expect(constantTimeCompare('', 'a')).toBe(false);
  });
  it('returns false for non-string inputs without throwing', () => {
    expect(constantTimeCompare(1 as unknown as string, 'a')).toBe(false);
    expect(constantTimeCompare('a', null as unknown as string)).toBe(false);
  });
});

describe('authCrypto - password validation', () => {
  it('enforces 12 char min and 72 byte max', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(MAX_PASSWORD_BYTES).toBe(72);
    expect(isPasswordValid('a'.repeat(11))).toBe(false);
    expect(isPasswordValid('a'.repeat(12))).toBe(true);
    expect(isPasswordValid('a'.repeat(72))).toBe(true);
    expect(isPasswordValid('a'.repeat(73))).toBe(false);
  });
  it('counts UTF-8 bytes, not chars', () => {
    // 24 multibyte chars * 3 bytes = 72 bytes
    const p = '\u4e2d'.repeat(24);
    expect(passwordByteLength(p)).toBe(72);
    expect(isPasswordValid(p)).toBe(true);
    expect(isPasswordValid('\u4e2d'.repeat(25))).toBe(false);
  });
  it('assertPasswordValid throws on invalid', () => {
    expect(() => assertPasswordValid('short')).toThrow();
  });
});

describe('authCrypto - bcrypt cost and hash format', () => {
  it('cost constants are 12..14', () => {
    expect(BCRYPT_COST_MIN).toBe(12);
    expect(BCRYPT_COST_MAX).toBe(14);
    expect(DEFAULT_BCRYPT_COST).toBe(12);
  });

  it('hashPassword produces valid 12-cost hash', async () => {
    const password = 'a'.repeat(12);
    const hash = await hashPassword(password, 12);
    expect(hash).toHaveLength(60);
    expect(isValidPasswordHash(hash)).toBe(true);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects bcrypt cost below 12 or above 14', async () => {
    const password = 'a'.repeat(12);
    await expect(hashPassword(password, 10)).rejects.toThrow();
    await expect(hashPassword(password, 11)).rejects.toThrow();
    await expect(hashPassword(password, 15)).rejects.toThrow();
  });

  it('isValidPasswordHash rejects placeholders and cost 10', () => {
    expect(isValidPasswordHash('$2b$10$' + 'a'.repeat(53))).toBe(false);
    expect(isValidPasswordHash('$2b$12$placeholder' + 'a'.repeat(42))).toBe(false);
    expect(isValidPasswordHash('not-a-hash')).toBe(false);
    expect(isValidPasswordHash('$2b$12$' + 'a'.repeat(52))).toBe(false); // wrong length
  });

  it('verifyPassword returns false for corrupted 12-cost hash', async () => {
    const corrupted = '$2b$12$' + 'a'.repeat(53);
    expect(corrupted).toHaveLength(60);
    expect(await verifyPassword('a'.repeat(12), corrupted)).toBe(false);
  });

  it('verifyPassword returns false for invalid password/hash inputs', async () => {
    expect(await verifyPassword('short', '$2b$12$' + 'a'.repeat(53))).toBe(false);
    expect(await verifyPassword('a'.repeat(12), 'garbage')).toBe(false);
  });

  it('hashPassword rejects invalid cost fraction via range/type', async () => {
    // bcrypt cost must be integer in supported range; 12.5 is not an allowed integer cost
    await expect(hashPassword('a'.repeat(12), 12.5 as unknown as number)).rejects.toThrow();
  });

  it('dummyPasswordHash is valid 12-cost hash', () => {
    expect(isValidPasswordHash(getDummyPasswordHash())).toBe(true);
    expect(isValidPasswordHash(dummyPasswordHash)).toBe(true);
  });
});

describe('authCrypto - rate bucket HMAC', () => {
  const secret = 's'.repeat(32);

  it('produces 64-hex HMAC for typed identities/ip/global', () => {
    for (const prefix of ['identity', 'ip', 'global'] as const) {
      const key = rateBucketKey({ prefix, value: 'user@example.com', secret });
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      // no plain PII leaks
      expect(key).not.toContain('user@example.com');
      expect(key).not.toContain('127.0.0.1');
    }
  });

  it('is deterministic for same inputs', () => {
    const a = rateBucketKey({ prefix: 'identity', value: 'v', secret });
    const b = rateBucketKey({ prefix: 'identity', value: 'v', secret });
    expect(a).toBe(b);
  });

  it('aliases agree', () => {
    const obj = { prefix: 'ip', value: '1.2.3.4', secret };
    expect(bucketKey(obj)).toBe(rateBucketKey(obj));
    expect(hmacRateBucketKey(obj)).toBe(rateBucketKey(obj));
    expect(createRateBucketKey(obj)).toBe(rateBucketKey(obj));
    expect(hashRateBucketKey(obj)).toBe(rateBucketKey(obj));
  });

  it('supports identifier/raw/key aliases', () => {
    const a = rateBucketKey({ prefix: 'identity', identifier: 'u1', key: secret });
    const b = rateBucketKey({ prefix: 'identity', raw: 'u1', secret });
    expect(a).toBe(b);
  });

  it('throws on missing value/secret/prefix', () => {
    expect(() => rateBucketKey({ prefix: 'identity', value: 'v' })).toThrow(/secret/);
    expect(() => rateBucketKey({ prefix: 'identity', secret })).toThrow(/value|Missing/);
    expect(() => rateBucketKey({ prefix: '', value: 'v', secret })).toThrow(/prefix/);
  });

  it('documents ambiguous positional parsing (long identity email misparsed)', () => {
    const longEmail = 'a'.repeat(33) + '@example.com'; // > 32 chars
    const intended = rateBucketKey({ prefix: 'identity', value: longEmail, secret });
    const positional = rateBucketKey('identity', longEmail, secret);
    // Positional form misclassifies the long email as the secret: contract mismatch.
    expect(positional).not.toBe(intended);
  });

  it('Buffer secret is accepted', () => {
    const buf = Buffer.from(secret, 'utf8');
    const a = rateBucketKey({ prefix: 'global', value: 'g', secret: buf });
    const b = rateBucketKey({ prefix: 'global', value: 'g', secret });
    expect(a).toBe(b);
  });
});

describe('redact', () => {
  it('redacts sensitive keys including nested', () => {
    const input = {
      user: {
        email: 'alice@example.com',
        password: 'hunter2',
        nested: { token: 'tok', secret: 'shh', safe: 42 },
      },
      authorization: 'Bearer x',
      query: 'q=1',
    };
    const out = redact(input) as Record<string, unknown>;
    const user = out.user as Record<string, unknown>;
    const nested = user.nested as Record<string, unknown>;
    expect(user.email).toBe(REDACTED_VALUE);
    expect(user.password).toBe(REDACTED_VALUE);
    expect(nested.token).toBe(REDACTED_VALUE);
    expect(nested.secret).toBe(REDACTED_VALUE);
    expect(nested.safe).toBe(42);
    expect(out.authorization).toBe(REDACTED_VALUE);
    expect(out.query).toBe(REDACTED_VALUE);
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = redact(obj) as Record<string, unknown>;
    expect(out.self).toBe('[Circular]');
  });

  it('redacts Error without leaking message/code/cause/stack', () => {
    const err = new Error('email alice@example.com Bearer secret-value');
    (err as Error & { code?: unknown }).code = 'Bearer secret-value';
    (err as Error & { cause?: unknown }).cause = new Error('cause leak');
    const redacted = redact(err) as Error & { code?: unknown };
    const serialized = JSON.stringify(redacted) + String(redacted.message) + String((redacted as { code?: unknown }).code ?? '');
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('Bearer secret-value');
    expect(serialized).not.toContain('cause leak');
    expect(redacted.message).not.toBe(err.message);
  });

  it('redactError drops arbitrary code/message (no leak)', () => {
    const err = new Error('top secret message');
    (err as Error & { code?: unknown }).code = 'Bearer secret-value';
    const redacted = redactError(err);
    const serialized = JSON.stringify(redacted) + redacted.message + String((redacted as { code?: unknown }).code ?? '');
    expect(serialized).not.toContain('Bearer secret-value');
    expect(serialized).not.toContain('top secret message');
  });

  it('aliases work', () => {
    expect(typeof redactValue).toBe('function');
    expect(typeof redactObject).toBe('function');
    expect(typeof sanitizeError).toBe('function');
  });

  it('redacts query strings in plain strings', () => {
    expect(redact('http://x/path?secret=1')).toBe('http://x/path');
  });
});
