import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ring-back-sms.vercel.app';

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
