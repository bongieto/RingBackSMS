import crypto from 'crypto';

interface PosOAuthState {
  tenantId: string;
  provider: string;
  nonce: string;
  exp: number;
}

function getStateSecret(): string {
  const secret = process.env.POS_OAUTH_STATE_SECRET ?? process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('POS_OAUTH_STATE_SECRET or ENCRYPTION_KEY is required');
  return secret;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
}

export function signPosOAuthState(tenantId: string, provider: string): string {
  const payload: PosOAuthState = {
    tenantId,
    provider,
    nonce: crypto.randomBytes(12).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyPosOAuthState(
  state: string,
  expectedProvider: string,
): { tenantId: string; provider: string } | null {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64url(encoded)) as Partial<PosOAuthState>;
    if (!payload.tenantId || !payload.provider || !payload.exp) return null;
    if (payload.provider !== expectedProvider) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { tenantId: payload.tenantId, provider: payload.provider };
  } catch {
    return null;
  }
}
