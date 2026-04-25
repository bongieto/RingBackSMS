// Centralized website-context extractor. Pulls a tenant's homepage HTML,
// strips tags, caps at ~5000 chars, and stores the result on
// TenantConfig.websiteContext. Read by fallbackFlow + the greeting
// generator to make AI replies aware of the tenant's actual services /
// brand voice.
//
// Triggered from two places:
//   1. updateTenantConfig — fire-and-forget when websiteUrl is set/changed
//   2. /api/tenants/:id/generate-greetings — synchronous fallback when
//      context is missing at greeting-generation time
//
// SSRF-guarded: HTTPS only, blocks RFC1918 / link-local / cloud-metadata
// hostnames so a malicious tenant can't aim us at internal infra.

import { prisma } from '../db';
import { logger } from '../logger';

const FETCH_TIMEOUT_MS = 10_000;
const CONTEXT_MAX_CHARS = 5000;
const USER_AGENT = 'RingbackSMS/1.0 (Business Context Extractor)';

/** Reject internal / metadata / non-HTTPS URLs. */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^0\./.test(hostname) ||
      hostname === '[::1]' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80')
    )
      return false;
    if (hostname === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch + flatten a homepage to plain text. Returns null on any failure
 * (blocked URL, bad status, timeout, parse error). Never throws.
 */
export async function fetchWebsiteContext(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) {
    logger.warn('SSRF blocked: unsafe URL', { url });
    return null;
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!response.ok) return null;
    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      // Strip JSON-LD / schema.org blobs that bloat the budget without
      // adding conversational signal.
      .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      // Decode the most common HTML entities — &amp; &nbsp; &quot; &#39;
      // — so they don't show up literally in the LLM prompt.
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, CONTEXT_MAX_CHARS);
    return text || null;
  } catch (err) {
    logger.warn('Failed to fetch website for context', {
      url,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Fetch the URL and persist the extracted text on the tenant's config.
 * Returns true on success, false on any failure or no-op (e.g. URL
 * rejected by SSRF guard). Safe to call as fire-and-forget from
 * background tasks.
 */
export async function extractAndStoreWebsiteContext(
  tenantId: string,
  url: string,
): Promise<boolean> {
  const context = await fetchWebsiteContext(url);
  if (!context) return false;
  try {
    await prisma.tenantConfig.update({
      where: { tenantId },
      data: { websiteContext: context },
    });
    logger.info('Website context extracted', {
      tenantId,
      url,
      chars: context.length,
    });
    return true;
  } catch (err) {
    logger.warn('Failed to store website context', {
      tenantId,
      url,
      error: (err as Error).message,
    });
    return false;
  }
}
