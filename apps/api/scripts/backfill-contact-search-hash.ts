/**
 * Backfills nameSearchHash / emailSearchHash on existing Contact rows.
 * One-off script — safe to re-run (idempotent).
 *
 * Run: pnpm tsx apps/api/scripts/backfill-contact-search-hash.ts
 * Requires: ENCRYPTION_KEY and (optionally) CONTACT_SEARCH_HMAC_KEY env vars.
 */
import { PrismaClient } from '@prisma/client';
import { createDecipheriv, createHmac } from 'crypto';

const prisma = new PrismaClient();

function getKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error('ENCRYPTION_KEY not set');
  return Buffer.from(k, 'hex');
}

function decryptMaybePlaintext(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length !== 3) return value;
  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const ct = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct) + decipher.final('utf8');
  } catch {
    return value;
  }
}

function hashForSearch(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const keyMaterial =
    process.env.CONTACT_SEARCH_HMAC_KEY ||
    `ringback-search:${process.env.ENCRYPTION_KEY ?? 'fallback'}`;
  return createHmac('sha256', keyMaterial).update(normalized).digest('hex');
}

async function main() {
  const rows = await prisma.contact.findMany({
    where: {
      OR: [
        { AND: [{ name: { not: null } }, { nameSearchHash: null }] },
        { AND: [{ email: { not: null } }, { emailSearchHash: null }] },
      ],
    },
    select: { id: true, name: true, email: true },
  });
  console.log(`Found ${rows.length} contacts to backfill`);

  let done = 0;
  for (const row of rows) {
    const name = decryptMaybePlaintext(row.name);
    const email = decryptMaybePlaintext(row.email);
    await prisma.contact.update({
      where: { id: row.id },
      data: {
        nameSearchHash: hashForSearch(name),
        emailSearchHash: hashForSearch(email),
      },
    });
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log(`✓ Backfilled ${done} contacts`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
