import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (date == null) return '';
  const d = date instanceof Date ? date : new Date(date);
  // `pickupTime` is stored as raw user text ("6:30pm", "asap") and isn't
  // a parseable datetime. Return the original string instead of crashing.
  if (Number.isNaN(d.getTime())) {
    return typeof date === 'string' ? date : '';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (date == null) return '';
  const then = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(then.getTime())) {
    return typeof date === 'string' ? date : '';
  }
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

/** Formats a caller number for authenticated operational screens. */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (national.length === 10) {
    const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    return digits.length === 11 ? `+1 ${formatted}` : formatted;
  }

  return phone;
}

/** Replaces a masked number in a callback task title for an authenticated operator. */
export function formatCallbackTaskTitle(title: string, callerPhone: string): string {
  if (!/^🔥?\s*Call back /i.test(title)) return title;

  return title.replace(
    /\+?[\d*]+(?=\s+(?:—|at)\s+|$)/,
    formatPhoneNumber(callerPhone)
  );
}
