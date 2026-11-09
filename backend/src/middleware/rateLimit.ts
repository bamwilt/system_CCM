import { Request, Response, NextFunction } from 'express';
import { authService, RateLimitedError } from '../services/auth.service';

export async function loginRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.preLoginRateLimit(req.ip ?? 'unknown');
    next();
  } catch (error) {
    if (error instanceof RateLimitedError) {
      res.set('Retry-After', String(error.retryAfter));
    }
    next(error);
  }
}


export const rateLimit = loginRateLimit;
export default loginRateLimit;
