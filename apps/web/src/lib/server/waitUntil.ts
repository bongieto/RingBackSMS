import { waitUntil as vercelWaitUntil } from '@vercel/functions';

/**
 * Safely run background work after a serverless handler returns its response.
 *
 * On Vercel, calls `waitUntil` to keep the function instance alive until the
 * promise settles — without this, fire-and-forget IIFEs can be paused or
 * killed when the HTTP response resolves, causing SMS sends to be dropped.
 *
 * In local dev or non-Vercel runtimes, falls back to attaching a no-op
 * `.catch` so unhandled rejections don't crash the process.
 */
export function waitUntil(promise: Promise<unknown>): void {
  try {
    vercelWaitUntil(promise);
  } catch {
    // Not on Vercel — just let the promise run to completion.
    promise.catch(() => {});
  }
}
