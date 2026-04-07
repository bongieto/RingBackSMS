import type { IndustryLandingContent } from '@/lib/industryLandingData';
import { INDUSTRY_LANDING } from '@/lib/industryLandingData';

interface Props {
  entry: IndustryLandingContent;
  siteUrl: string;
}

export function IndustryJsonLd({ entry, siteUrl }: Props) {
  const url = `${siteUrl}/industries/${entry.slug}`;

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: entry.seo.title,
    description: entry.seo.description,
    url,
    provider: {
      '@type': 'Organization',
      name: 'RingBackSMS',
      url: siteUrl,
    },
    areaServed: 'US',
    serviceType: 'SMS auto-response & AI customer service',
  };

  const faqLd =
    entry.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: entry.faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }
      : null;

  const breadcrumbItems: Array<{ name: string; item: string }> = [
    { name: 'Home', item: siteUrl },
    { name: 'Industries', item: `${siteUrl}/industries` },
  ];
  if (entry.kind === 'niche' && entry.parent) {
    const parent = INDUSTRY_LANDING[entry.parent];
    if (parent) {
      breadcrumbItems.push({ name: parent.hero.eyebrow.replace(/^For /, ''), item: `${siteUrl}/industries/${parent.slug}` });
    }
  }
  breadcrumbItems.push({ name: entry.hero.eyebrow.replace(/^For /, ''), item: url });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: b.item,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </>
  );
}
