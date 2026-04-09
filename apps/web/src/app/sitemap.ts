import type { MetadataRoute } from 'next';
import { getAllIndustrySlugPaths } from '@/lib/industryLandingData';

const SITE_URL = 'https://ringbacksms.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/industries`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const industryRoutes: MetadataRoute.Sitemap = getAllIndustrySlugPaths().map((path) => ({
    url: `${SITE_URL}/industries/${path.join('/')}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: path.length === 1 ? 0.9 : 0.8,
  }));

  return [...staticRoutes, ...industryRoutes];
}
