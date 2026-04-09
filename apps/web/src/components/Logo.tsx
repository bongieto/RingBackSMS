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

const SIZE_STYLES: Record<LogoSize, { text: string; icon: number }> = {
  sm: { text: 'text-lg', icon: 50 },
  md: { text: 'text-xl', icon: 60 },
  lg: { text: 'text-3xl', icon: 80 },
};

export function Logo({
  size = 'md',
  variant = 'light',
  href = '/',
  className,
}: LogoProps) {
  const sz = SIZE_STYLES[size];
  const accent = variant === 'dark' ? 'text-blue-400' : 'text-blue-600';
  const base = variant === 'dark' ? 'text-white' : 'text-slate-900';

  const content = (
    <span className={cn('inline-flex items-center gap-0 font-extrabold', base, sz.text, className)}>
      <Image
        src="/favicon.png"
        alt=""
        width={sz.icon}
        height={sz.icon}
        className="object-contain"
        unoptimized
      />
      <span>
        RingBack<span className={accent}>SMS</span>
      </span>
    </span>
  );

  if (href === null) return content;
  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
