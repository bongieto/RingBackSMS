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

const SIZE_STYLES: Record<LogoSize, { text: string; sub: string; icon: number }> = {
  sm: { text: 'text-lg', sub: 'text-[7px]', icon: 32 },
  md: { text: 'text-xl', sub: 'text-[8px]', icon: 38 },
  lg: { text: 'text-3xl', sub: 'text-[11px]', icon: 50 },
};

export function Logo({
  size = 'md',
  variant = 'light',
  href = '/',
  className,
}: LogoProps) {
  const sz = SIZE_STYLES[size];
  const isInverse = variant === 'dark';
  const accent = 'text-[#F05A37]';
  const base = isInverse ? 'text-[#F6F0E4]' : 'text-[#171713]';

  const content = (
    <span className={cn('inline-flex items-center gap-2 font-extrabold', base, sz.text, className)}>
      <Image
        src={isInverse ? '/brand-mark-inverse.png' : '/brand-mark.png'}
        alt=""
        width={sz.icon}
        height={sz.icon}
        className="shrink-0 object-contain"
        aria-hidden="true"
      />
      <span className="flex flex-col leading-tight w-fit">
        <span className="tracking-[-0.045em]">RingBack<span className={accent}>SMS</span></span>
        <span className={cn(sz.sub, 'hidden w-full whitespace-nowrap pl-[1px] font-bold tracking-[0.02em] sm:block', isInverse ? 'text-[#B9B4A9]' : 'text-[#6A6B62]')}>
          MISSED CALL RECOVERY SYSTEM
        </span>
      </span>
    </span>
  );

  if (href === null) return content;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="RingBackSMS home">
      {content}
    </Link>
  );
}
