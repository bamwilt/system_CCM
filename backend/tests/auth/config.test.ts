import { vi, describe, it, expect } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { parseEnv } from '../../src/config/env';

const P = (overrides: Record<string, string | undefined> = {}) =>
  ({ NODE_ENV: 'development', ...overrides } as NodeJS.ProcessEnv);

describe('parseEnv - pure parsing and defaults', () => {
  it('returns core API fields (port, host, db, cors, auth, session, cookie)', () => {
    const env = parseEnv(P());
    expect(env).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      host: '0.0.0.0',
    });
    expect(env.db).toMatchObject({
      host: 'localhost',
      port: 5432,
      name: 'sgpm_dev',
      user: 'sgpm_user',
      password: 'sgpm_dev_password',
      poolMin: 2,
      poolMax: 10,
    });
    expect(env.cors).toEqual({ origin: 'http://localhost:5173' });
    expect(env.auth).toBeDefined();
    expect(env.session).toBe(env.auth);
    expect(env.cookie).toBe(env.auth.cookie);
  });

  it('preserves explicit API/db/cors/port overrides', () => {
    const env = parseEnv(
      P({
        PORT: '4000',
        DB_HOST: 'db.example.com',
        DB_PORT: '5433',
        DB_NAME: 'mydb',
        DB_USER: 'myuser',
        DB_PASSWORD: 'MyStr0ngDbP4ssphrase9876543210',
        CORS_ORIGIN: 'http://localhost:3000',
      })
    );
    expect(env.port).toBe(4000);
    expect(env.db.host).toBe('db.example.com');
    expect(env.db.port).toBe(5433);
    expect(env.db.name).toBe('mydb');
    expect(env.db.user).toBe('myuser');
    expect(env.cors.origin).toBe('http://localhost:3000');
  });

  it('defaults session TTL to 8h (28800000 ms)', () => {
    const env = parseEnv(P());
    expect(env.auth.sessionTtl).toBe('8h');
    expect(env.auth.sessionTtlMs).toBe(8 * 60 * 60 * 1000);
    expect(env.auth.sessionTtlSeconds).toBe(8 * 60 * 60);
    expect(env.auth.sessionTtlMinutes).toBe(8 * 60);
    expect(env.auth.sessionTtlHours).toBe(8);
  });

  it('defaults bcrypt cost 12, login 5 failures, 15 min window', () => {
    const env = parseEnv(P());
    expect(env.auth.bcryptCost).toBe(12);
    expect(env.auth.loginMaxFailures).toBe(5);
    expect(env.auth.loginWindowMinutes).toBe(15);
    expect(env.auth.loginWindowMs).toBe(15 * 60 * 1000);
    expect(env.auth.recoveryEnabled).toBe(false);
  });

  it('defaults rateKey in development (dev-only)', () => {
    const env = parseEnv(P());
    expect(env.auth.rateKey).toBe('dev-only-auth-rate-key-not-for-production-0123456789');
  });

  it('cookie defaults: httpOnly true, sameSite lax, secure false in dev', () => {
    const env = parseEnv(P());
    expect(env.auth.cookie).toEqual({ secure: false, httpOnly: true, sameSite: 'lax' });
    expect(env.cookie).toBe(env.auth.cookie);
  });
});

describe('parseEnv - NODE_ENV enum', () => {
  it('accepts development/test/production', () => {
    expect(parseEnv(P({ NODE_ENV: 'test' })).nodeEnv).toBe('test');
    expect(parseEnv(P({ NODE_ENV: 'production', DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'Sup3rStr0ngDbP4ssphrase9876543210', CORS_ORIGIN: 'https://app.example.com', AUTH_RATE_KEY: 'a'.repeat(32) })).nodeEnv).toBe('production');
  });
  it('rejects invalid NODE_ENV', () => {
    expect(() => parseEnv(P({ NODE_ENV: 'staging' }))).toThrow(/Invalid NODE_ENV/);
    expect(() => parseEnv(P({ NODE_ENV: 'PRODUCTION' }))).toThrow(/Invalid NODE_ENV/);
  });
  it('empty NODE_ENV defaults to development', () => {
    expect(parseEnv(P({ NODE_ENV: '   ' })).nodeEnv).toBe('development');
  });
});

describe('parseEnv - strict integers and ranges', () => {
  it('rejects non-integer PORT', () => {
    expect(() => parseEnv(P({ PORT: '3000.5' }))).toThrow(/strict integer/);
    expect(() => parseEnv(P({ PORT: 'abc' }))).toThrow(/strict integer/);
    expect(() => parseEnv(P({ PORT: '1e3' }))).toThrow(/strict integer/);
    expect(() => parseEnv(P({ PORT: '3000.0' }))).toThrow(/strict integer/);
  });
  it('enforces PORT range 1..65535', () => {
    expect(() => parseEnv(P({ PORT: '0' }))).toThrow(/out of allowed range/);
    expect(() => parseEnv(P({ PORT: '65536' }))).toThrow(/out of allowed range/);
    expect(parseEnv(P({ PORT: '1' })).port).toBe(1);
    expect(parseEnv(P({ PORT: '65535' })).port).toBe(65535);
  });
  it('enforces pool ranges and poolMin <= poolMax', () => {
    expect(() => parseEnv(P({ DB_POOL_MIN: '101' }))).toThrow(/out of allowed range/);
    expect(() => parseEnv(P({ DB_POOL_MAX: '0' }))).toThrow(/out of allowed range/);
    expect(() => parseEnv(P({ DB_POOL_MIN: '5', DB_POOL_MAX: '3' }))).toThrow(/poolMin must be less than or equal/);
    expect(parseEnv(P({ DB_POOL_MIN: '0', DB_POOL_MAX: '1' })).db.poolMin).toBe(0);
  });
  it('rejects fractional bcrypt cost via strict integer (12.5)', () => {
    expect(() => parseEnv(P({ AUTH_BCRYPT_COST: '12.5' }))).toThrow(/strict integer/);
  });
  it('enforces bcrypt cost 12..14', () => {
    expect(() => parseEnv(P({ AUTH_BCRYPT_COST: '11' }))).toThrow(/out of allowed range/);
    expect(() => parseEnv(P({ AUTH_BCRYPT_COST: '15' }))).toThrow(/out of allowed range/);
    expect(parseEnv(P({ AUTH_BCRYPT_COST: '14' })).auth.bcryptCost).toBe(14);
  });
  it('rejects fractional session TTL amounts', () => {
    expect(() => parseEnv(P({ AUTH_SESSION_TTL: '8.5h' }))).toThrow();
  });
  it('enforces session TTL range (min 5m, max 24h)', () => {
    expect(() => parseEnv(P({ AUTH_SESSION_TTL: '1m' }))).toThrow(/out of allowed range/);
    expect(() => parseEnv(P({ AUTH_SESSION_TTL: '25h' }))).toThrow(/out of allowed range/);
  });
});

describe('parseEnv - production rejects defaults/weak secrets', () => {
  const prodBase = {
    NODE_ENV: 'production',
    DB_HOST: 'db.prod',
    DB_NAME: 'sgpm_prod',
    DB_USER: 'sgpm_prod_user',
    DB_PASSWORD: 'Sup3rStr0ngDbP4ssphrase9876543210',
    CORS_ORIGIN: 'https://app.example.com',
    AUTH_RATE_KEY: 'z'.repeat(32),
  };
  it('requires DB_HOST/DB_NAME/DB_USER/DB_PASSWORD/CORS_ORIGIN/AUTH_RATE_KEY in prod', () => {
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'CORS_ORIGIN', 'AUTH_RATE_KEY']) {
      const input = { ...prodBase } as Record<string, string>;
      delete input[key];
      expect(() => parseEnv(input as NodeJS.ProcessEnv)).toThrow();
    }
  });
  it('rejects default/weak DB_PASSWORD in prod', () => {
    expect(() => parseEnv(P({ ...prodBase, DB_PASSWORD: 'sgpm_dev_password' }))).toThrow(/DB_PASSWORD/);
    expect(() => parseEnv(P({ ...prodBase, DB_PASSWORD: 'change-me-now-1234567890' }))).toThrow(/DB_PASSWORD/);
  });
  it('rejects copy of dev AUTH_RATE_KEY in prod', () => {
    expect(() =>
      parseEnv(P({ ...prodBase, AUTH_RATE_KEY: 'dev-only-auth-rate-key-not-for-production-0123456789' }))
    ).toThrow(/AUTH_RATE_KEY/);
  });
  it('rejects weak/short AUTH_RATE_KEY in prod', () => {
    expect(() => parseEnv(P({ ...prodBase, AUTH_RATE_KEY: 'secret' }))).toThrow(/AUTH_RATE_KEY/);
    expect(() => parseEnv(P({ ...prodBase, AUTH_RATE_KEY: 'a'.repeat(16) }))).toThrow(/AUTH_RATE_KEY/);
  });
  it('rejects non-HTTPS CORS origin in prod', () => {
    expect(() => parseEnv(P({ ...prodBase, CORS_ORIGIN: 'http://app.example.com' }))).toThrow(/HTTPS/);
  });
  it('accepts valid prod config', () => {
    const env = parseEnv(P(prodBase) as NodeJS.ProcessEnv);
    expect(env.isProd).toBe(true);
    expect(env.cors.origin).toBe('https://app.example.com');
    expect(env.auth.cookie.secure).toBe(true);
  });
});

describe('parseEnv - CORS exactness', () => {
  it('rejects wildcard, comma, path, query, fragment, userinfo', () => {
    expect(() => parseEnv(P({ CORS_ORIGIN: 'http://localhost:5173,*' }))).toThrow();
    expect(() => parseEnv(P({ CORS_ORIGIN: 'http://localhost:5173/*' }))).toThrow();
    expect(() => parseEnv(P({ CORS_ORIGIN: 'http://localhost:5173/api' }))).toThrow(/path/);
    expect(() => parseEnv(P({ CORS_ORIGIN: 'http://localhost:5173?x=1' }))).toThrow(/query/);
    expect(() => parseEnv(P({ CORS_ORIGIN: 'http://localhost:5173#frag' }))).toThrow(/fragment/);
    expect(() => parseEnv(P({ CORS_ORIGIN: 'http://user:pass@localhost:5173' }))).toThrow(/userinfo/);
    expect(() => parseEnv(P({ CORS_ORIGIN: 'ftp://localhost:5173' }))).toThrow();
  });
});

describe('parseEnv - recovery always disabled', () => {
  it('rejects recovery enabled in any env', () => {
    expect(() => parseEnv(P({ AUTH_RECOVERY_ENABLED: 'true' }))).toThrow(/recovery is not available/i);
    expect(() => parseEnv(P({ AUTH_RECOVERY_ENABLED: '1' }))).toThrow();
    expect(() => parseEnv(P({ PASSWORD_RECOVERY_ENABLED: 'yes' }))).toThrow();
  });
  it('recoveryEnabled stays false when unset', () => {
    expect(parseEnv(P()).auth.recoveryEnabled).toBe(false);
  });
});

describe('parseEnv - cookie security', () => {
  it('requires secure in prod', () => {
    expect(() => parseEnv(P({ ...{ NODE_ENV: 'production', DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'Sup3rStr0ngDbP4ssphrase9876543210', CORS_ORIGIN: 'https://app.example.com', AUTH_RATE_KEY: 'z'.repeat(32) }, AUTH_COOKIE_SECURE: 'false' }))).toThrow(/secure is required/);
  });
  it('rejects httpOnly false', () => {
    expect(() => parseEnv(P({ AUTH_COOKIE_HTTP_ONLY: 'false' }))).toThrow(/httpOnly cannot be disabled/);
  });
  it('rejects sameSite none without secure', () => {
    expect(() => parseEnv(P({ AUTH_COOKIE_SAME_SITE: 'none' }))).toThrow(/sameSite none requires secure/);
  });
});
