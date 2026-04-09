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

const SIZE_DIMS: Record<LogoSize, { width: number; height: number }> = {
  sm: { width: 140, height: 40 },
  md: { width: 180, height: 50 },
  lg: { width: 260, height: 72 },
};

export function Logo({
  size = 'md',
  variant = 'light',
  href = '/',
  className,
}: LogoProps) {
  const dims = SIZE_DIMS[size];
  const filter = variant === 'dark' ? 'brightness(0) invert(1)' : undefined;

  const content = (
    <Image
      src="/logo.png"
      alt="RingbackSMS"
      width={dims.width}
      height={dims.height}
      className={cn('object-contain', className)}
      style={filter ? { filter } : undefined}
      priority={size === 'lg'}
    />
  );

  if (href === null) return content;
  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
