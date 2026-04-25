// Centralized website-context extractor. Crawls a tenant's homepage plus
// up to 3 high-signal sub-pages (about, services, contact, pricing) and
// merges them into one plain-text snippet stored on
// TenantConfig.websiteContext. Read by fallbackFlow + the greeting
// generator to make AI replies aware of the tenant's actual offering and
// brand voice.
//
// Triggered from two places:
//   1. updateTenantConfig — fire-and-forget when websiteUrl is set/changed
//   2. /api/tenants/:id/generate-greetings — synchronous fallback when
//      context is missing at greeting-generation time
//
// SSRF-guarded: HTTPS only, blocks RFC1918 / link-local / cloud-metadata
// hostnames so a malicious tenant can't aim us at internal infra. Each
// sub-page URL is re-checked before fetch.

import { prisma } from '../db';
import { logger } from '../logger';

const FETCH_TIMEOUT_MS = 10_000;
const CONTEXT_MAX_CHARS = 8000;
const PER_PAGE_MAX_CHARS = 2500;
const MAX_SUBPAGES = 3;
const USER_AGENT = 'RingbackSMS/1.0 (Business Context Extractor)';

/** Path tokens that suggest a high-value sub-page worth crawling. */
const SUBPAGE_KEYWORDS = [
  'about',
  'service',
  'services',
  'what-we-do',
  'offerings',
  'contact',
  'pricing',
  'rates',
  'menu',
  'team',
  'faq',
];

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

/** Fetch raw HTML or return null. Never throws. */
async function fetchHtml(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) {
    logger.warn('SSRF blocked: unsafe URL', { url });
    return null;
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow', // sub-pages often 301 to canonical with trailing slash
    });
    if (!response.ok) return null;
    const ct = response.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return null;
    return await response.text();
  } catch (err) {
    logger.warn('Failed to fetch URL', {
      url,
      error: (err as Error).message,
    });
    return null;
  }
}

/** Strip tags, scripts, styles, common entities. Trim + collapse whitespace. */
function flattenHtmlToText(html: string, maxChars: number): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxChars);
}

/**
 * Pull up to MAX_SUBPAGES internal links from `html` whose path or anchor
 * text contains a SUBPAGE_KEYWORDS token. Returns absolute URLs on the
 * same origin as `baseUrl`. Order = first appearance in the DOM.
 */
function extractSubpageUrls(html: string, baseUrl: string): string[] {
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const found = new Set<string>();
  const candidates: string[] = [];

  // Match <a href="...">visible text</a> — captures both attrs so we can
  // score by either.
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = m[1].trim();
    const anchorText = m[2].replace(/<[^>]+>/g, '').toLowerCase();

    let abs: string;
    try {
      abs = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }
    // Same-origin only.
    if (!abs.startsWith(baseOrigin)) continue;
    // Drop the homepage itself + fragments + assets.
    if (abs === baseUrl || abs === `${baseOrigin}/`) continue;
    if (abs.includes('#')) abs = abs.split('#')[0];
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip)$/i.test(abs)) continue;

    const lower = abs.toLowerCase();
    const matches =
      SUBPAGE_KEYWORDS.some((kw) => lower.includes(`/${kw}`)) ||
      SUBPAGE_KEYWORDS.some((kw) => anchorText.includes(kw));
    if (!matches) continue;

    if (!found.has(abs)) {
      found.add(abs);
      candidates.push(abs);
      if (candidates.length >= MAX_SUBPAGES) break;
    }
  }

  return candidates;
}

/**
 * Fetch the homepage + a handful of relevant sub-pages and flatten the
 * lot to plain text. Each page's contribution is capped so one bloated
 * page can't crowd out the others.
 *
 * Returns null on any failure (blocked URL, homepage fetch error,
 * empty content). Never throws.
 */
export async function fetchWebsiteContext(url: string): Promise<string | null> {
  const homeHtml = await fetchHtml(url);
  if (!homeHtml) return null;

  const homeText = flattenHtmlToText(homeHtml, PER_PAGE_MAX_CHARS);
  if (!homeText) return null;

  const subpageUrls = extractSubpageUrls(homeHtml, url);

  // Fire sub-page fetches in parallel — they're all independent.
  const subpageFetches = await Promise.all(
    subpageUrls.map(async (subUrl) => {
      const html = await fetchHtml(subUrl);
      if (!html) return null;
      const text = flattenHtmlToText(html, PER_PAGE_MAX_CHARS);
      if (!text) return null;
      // Label so the LLM can tell pages apart.
      const label = labelForUrl(subUrl);
      return `[${label}] ${text}`;
    }),
  );

  const sections = [`[home] ${homeText}`, ...subpageFetches.filter((s): s is string => Boolean(s))];
  const merged = sections.join('\n\n').substring(0, CONTEXT_MAX_CHARS);
  return merged || null;
}

function labelForUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    return path || 'page';
  } catch {
    return 'page';
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
