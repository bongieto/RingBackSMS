import { Request, Response, NextFunction, RequestHandler } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

declare global {
  namespace Express {
    interface Request {
      clerkOrgId?: string;
      clerkUserId?: string;
    }
  }
}

/**
 * Clerk JWT verification middleware — attaches orgId and userId to request.
 */
export const clerkAuth: RequestHandler = clerkMiddleware() as RequestHandler;

/**
 * Requires a valid Clerk session. Must be used after clerkAuth.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    req.clerkUserId = auth.userId;
    req.clerkOrgId = auth.orgId ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Requires a Clerk org membership (for tenant-scoped endpoints).
 */
export function requireOrgAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!auth.orgId) {
      throw new UnauthorizedError('Organization membership required');
    }

    req.clerkUserId = auth.userId;
    req.clerkOrgId = auth.orgId;
    next();
  } catch (error) {
    next(error);
  }
}
