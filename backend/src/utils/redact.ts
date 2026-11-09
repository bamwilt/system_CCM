export const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_TOKENS = [
  'password',
  'token',
  'secret',
  'cookie',
  'authorization',
  'email',
  'query',
] as const;

export const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'token',
  'secret',
  'cookie',
  'authorization',
  'email',
  'ip',
  'query',
] as const;

export function isSensitiveKey(key: string): boolean {
  const normalized = String(key).toLowerCase();
  if (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('cookie') ||
    normalized.includes('authorization') ||
    normalized.includes('email') ||
    normalized.includes('query')
  ) {
    return true;
  }
  if (normalized === 'ip') {
    return true;
  }
  if (normalized.endsWith('ip') || normalized.includes('ip_') || normalized.includes('_ip')) {
    return true;
  }
  if (normalized.includes('ipaddress')) {
    return true;
  }
  return false;
}

export function redactQueryString(value: string): string {
  if (typeof value !== 'string') {
    return value;
  }
  const queryIndex = value.indexOf('?');
  if (queryIndex === -1) {
    return value;
  }
  return value.slice(0, queryIndex);
}

const ALLOWED_ERROR_NAMES = new Set<string>([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
]);

export function redactError(error: unknown): Error {
  const rawName = error instanceof Error ? error.name : 'Error';
  const safeName = ALLOWED_ERROR_NAMES.has(rawName) ? rawName : 'Error';

  const sanitized = new Error(safeName);
  sanitized.name = safeName;
  return sanitized;
}

export const sanitizeError = redactError;

export function redact(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactQueryString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[Circular]';
  }
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item, seen));
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (value instanceof Error) {
      return redactError(value);
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED_VALUE;
      } else {
        result[key] = redact(source[key], seen);
      }
    }

    return result;
  } finally {
    seen.delete(value as object);
  }
}

export const redactValue = redact;
export const redactObject = redact;