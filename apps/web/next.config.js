/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@ringback/shared-types'],
  // All pages are authenticated / dynamic — skip static pre-rendering
  experimental: {
    // Suppress Clerk prerender errors when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is absent
  },
};

module.exports = nextConfig;
