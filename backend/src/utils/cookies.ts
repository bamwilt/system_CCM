import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { env } from '../config/env';
import { hashToken } from './authCrypto';

export const SESSION_COOKIE_NAME = env.isProd ? '__Host-sgpm_session' : 'sgpm_session';

export const COOKIE_NAME = SESSION_COOKIE_NAME;
export const AUTH_COOKIE_NAME = SESSION_COOKIE_NAME;
export const SGPM_SESSION_COOKIE = SESSION_COOKIE_NAME;
export const sessionCookieName = SESSION_COOKIE_NAME;
export const cookieName = SESSION_COOKIE_NAME;

const COOKIE_HEADER_LIMIT = 8192;

export type CookieMap = Record<string, string>;

export function isValidCookieName(name: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);
}

export function parseCookieHeader(header: string | undefined): CookieMap | null {
  if (header === undefined) {
    return {};
  }
  if (typeof header !== 'string') {
    return null;
  }
  if (header.length > COOKIE_HEADER_LIMIT) {
    return null;
  }
  const result: CookieMap = {};
  if (header.trim() === '') {
    return result;
  }
  const parts = header.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      return null;
    }
    const name = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    if (!isValidCookieName(name)) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(result, name)) {
      return null;
    }
    if (rawValue === '') {
      return null;
    }
    if (/[^\t !#-:<-[\]-~]/.test(rawValue)) {
      return null;
    }
    result[name] = rawValue;
  }
  return result;
}

export function parseCookies(header: string | undefined): CookieMap | null {
  return parseCookieHeader(header);
}

export function getSessionTokenFromCookieHeader(header: string | undefined): string | null {
  const cookies = parseCookieHeader(header);
  if (cookies === null) {
    return null;
  }
  const value = cookies[SESSION_COOKIE_NAME];
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  if (!/^[0-9a-f]{64}$/.test(value)) {
    return null;
  }
  return value;
}

export function getSessionTokenFromRequest(req: Request): string | null {
  return getSessionTokenFromCookieHeader(req.headers.cookie);
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: env.auth.cookie.httpOnly,
    secure: env.auth.cookie.secure,
    sameSite: env.auth.cookie.sameSite,
    path: '/',
    expires: expiresAt,
    maxAge,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: env.auth.cookie.httpOnly,
    secure: env.auth.cookie.secure,
    sameSite: env.auth.cookie.sameSite,
    path: '/',
  });
}

export function hashSessionToken(token: string): string {
  return hashToken(token);
}

export const _crypto = crypto;
