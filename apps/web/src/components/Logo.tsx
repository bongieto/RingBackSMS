import Link from 'next/link';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'light' | 'dark';

interface LogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  href?: string | null;
  className?: string;
}

const SIZE_STYLES: Record<LogoSize, { text: string; icon: string }> = {
  sm: { text: 'text-lg', icon: 'h-5 w-5' },
  md: { text: 'text-xl', icon: 'h-6 w-6' },
  lg: { text: 'text-3xl', icon: 'h-8 w-8' },
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
    <span className={cn('inline-flex items-center gap-1.5 font-extrabold', base, sz.text, className)}>
      <Phone className={cn(sz.icon, accent)} strokeWidth={2.5} />
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
