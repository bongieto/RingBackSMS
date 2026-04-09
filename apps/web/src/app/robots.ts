import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ringbacksms.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
