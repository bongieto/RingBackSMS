/** @type {import('next').NextConfig} */

// Report-only CSP — permissive baseline to observe without breaking
// Clerk / Stripe / Twilio / Vercel widgets. Flip to enforcing after review.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.ringbacksms.com https://challenges.cloudflare.com https://js.stripe.com https://*.stripe.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.ringbacksms.com https://api.stripe.com https://*.stripe.com https://api.minimax.io wss: https:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk.ringbacksms.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
];

const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@ringback/shared-types'],
  // All pages are authenticated / dynamic — skip static pre-rendering
  experimental: {
    // Suppress Clerk prerender errors when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is absent
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'ring-back-sms.vercel.app' }],
        destination: 'https://ringbacksms.com/:path*',
        permanent: true,
      },
    ];
  },
};

// Wrap with Sentry for error monitoring (no-op if SENTRY_DSN is not set)
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  // Suppress Sentry source map upload warnings when no auth token is set
  silent: true,
  // Don't widen the Next.js build output
  widenClientFileUpload: false,
  // Disable source map upload (enable when SENTRY_AUTH_TOKEN is configured)
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
});
