import { lookup } from 'dns/promises';
import { isIP } from 'net';

function isPrivateAddress(address: string): boolean {
  if (address === '::1' || address === '0.0.0.0') return true;
  if (address.startsWith('10.') || address.startsWith('127.') || address.startsWith('192.168.'))
    return true;
  const [a, b] = address.split('.').map(Number);
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  const normalized = address.toLowerCase();
  return (
    normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
  );
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Webhook URL must be a credential-free HTTPS URL on port 443');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Webhook URL host is not allowed');
  }
  const records = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Webhook URL resolves to a private or reserved address');
  }
  return url;
}
