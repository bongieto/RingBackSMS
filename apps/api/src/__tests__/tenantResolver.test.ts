import { Request, Response, NextFunction } from 'express';
import { tenantResolver } from '../middleware/tenantResolver';

// Mock dependencies
jest.mock('@prisma/client', () => {
  const mockFindUnique = jest.fn();
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      tenant: { findUnique: mockFindUnique },
    })),
    __mockFindUnique: mockFindUnique,
  };
});

jest.mock('twilio', () => {
  const mockTwilio = jest.fn();
  (mockTwilio as jest.Mock & { validateRequest: jest.Mock }).validateRequest = jest.fn().mockReturnValue(true);
  return mockTwilio;
});

jest.mock('../utils/encryption', () => ({
  decryptNullable: jest.fn((v: string | null) => v),
}));

jest.mock('../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const { __mockFindUnique } = jest.requireMock('@prisma/client') as {
  __mockFindUnique: jest.Mock;
};

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    body: { To: '+12175550100', From: '+12175550199' },
    query: {},
    headers: { 'x-twilio-signature': 'valid-sig' },
    originalUrl: '/webhooks/twilio/sms-reply',
    ...overrides,
  };
}

function makeRes(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('tenantResolver middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('returns 400 when To number is missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();

    await tenantResolver(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when tenant not found', async () => {
    __mockFindUnique.mockResolvedValue(null);

    const req = makeReq();
    const res = makeRes();

    await tenantResolver(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for inactive tenant', async () => {
    __mockFindUnique.mockResolvedValue({
      id: 'tenant-1',
      isActive: false,
      twilioAuthToken: null,
      twilioSubAccountSid: null,
    });

    const req = makeReq();
    const res = makeRes();

    await tenantResolver(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when tenant has no auth token (fail-closed)', async () => {
    __mockFindUnique.mockResolvedValue({
      id: 'tenant-abc',
      isActive: true,
      twilioAuthToken: null,
      twilioSubAccountSid: 'AC123',
    });

    const req = makeReq();
    const res = makeRes();

    await tenantResolver(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets tenantId for valid tenant with valid signature', async () => {
    __mockFindUnique.mockResolvedValue({
      id: 'tenant-abc',
      isActive: true,
      twilioAuthToken: 'encrypted-token',
      twilioSubAccountSid: 'AC123',
    });

    const req = makeReq() as Request & { tenantId?: string };
    const res = makeRes();

    await tenantResolver(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.tenantId).toBe('tenant-abc');
  });
});
