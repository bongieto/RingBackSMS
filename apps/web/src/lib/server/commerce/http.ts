import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { CommerceAuthError } from './apiAuth';

export function commerceResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

export function commerceError(error: unknown): NextResponse {
  if (error instanceof CommerceAuthError) {
    return NextResponse.json(
      {
        error: {
          code:
            error.status === 401
              ? 'unauthorized'
              : error.status === 403
                ? 'forbidden'
                : 'rate_limited',
          message: error.message,
        },
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_request',
          message: 'Request validation failed',
          details: error.flatten(),
        },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export function conflict(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: 'conflict', message } },
    { status: 409, headers: { 'Cache-Control': 'no-store' } }
  );
}
