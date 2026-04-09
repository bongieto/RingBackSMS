import { Prisma } from '@prisma/client';

/**
 * Returns true if the error is a Prisma unique-constraint violation (P2002).
 * Optionally narrow to a specific field by passing `target`.
 */
export function isUniqueViolation(err: unknown, target?: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    (!target || ((err.meta?.target as string[]) ?? []).includes(target))
  );
}
