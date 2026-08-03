import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '../db';
import type { CommerceScope } from '@ringback/shared-types';
import { checkRateLimit } from '../rateLimit';

export interface CommerceAuthContext {
  credentialId: string;
  tenantId: string;
  connectionId: string | null;
  scopes: string[];
}

export class CommerceAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 429
  ) {
    super(message);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateApiCredential(): { token: string; prefix: string; hash: string } {
  const token = `rb_live_${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, 16), hash: hashToken(token) };
}

export async function authenticateCommerceRequest(
  request: NextRequest,
  requiredScopes: CommerceScope[]
): Promise<CommerceAuthContext> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new CommerceAuthError('Missing bearer credential', 401);
  }
  const token = authorization.slice(7).trim();
  if (!token.startsWith('rb_live_') || token.length < 40) {
    throw new CommerceAuthError('Invalid bearer credential', 401);
  }

  const credential = await prisma.apiCredential.findUnique({
    where: { keyHash: hashToken(token) },
    select: {
      id: true,
      tenantId: true,
      connectionId: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (
    !credential ||
    credential.revokedAt ||
    (credential.expiresAt && credential.expiresAt <= new Date())
  ) {
    throw new CommerceAuthError('Invalid or expired bearer credential', 401);
  }
  const missing = requiredScopes.filter((scope) => !credential.scopes.includes(scope));
  if (missing.length > 0) {
    throw new CommerceAuthError(`Missing required scope: ${missing.join(', ')}`, 403);
  }
  const rateLimit = await checkRateLimit(`commerce:${credential.id}`, 600, 60);
  if (!rateLimit.allowed) {
    throw new CommerceAuthError('Rate limit exceeded', 429);
  }

  await prisma.apiCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  });
  return {
    credentialId: credential.id,
    tenantId: credential.tenantId,
    connectionId: credential.connectionId,
    scopes: credential.scopes,
  };
}
