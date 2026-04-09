import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'light' | 'dark';

interface LogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  href?: string | null;
  className?: string;
}

const SIZE_DIMS: Record<LogoSize, number> = {
  sm: 80,
  md: 100,
  lg: 140,
};

/**
 * Renders the RingbackSMS logo icon.
 *
 * variant="dark"  → logolight.png (light icon for dark backgrounds)
 * variant="light" → logodark.png  (dark icon for light backgrounds)
 */
export function Logo({
  size = 'md',
  variant = 'light',
  href = '/',
  className,
}: LogoProps) {
  const dim = SIZE_DIMS[size];
  const src = variant === 'dark' ? '/logolight.png' : '/logodark.png';

  const content = (
    <Image
      src={src}
      alt="RingbackSMS"
      width={dim}
      height={dim}
      className={cn('object-contain', className)}
      unoptimized
    />
  );

  if (href === null) return content;
  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
