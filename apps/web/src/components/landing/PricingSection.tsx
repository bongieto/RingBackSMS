'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

interface PricingPlan {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  monthlyPeriod: string;
  annualPeriod: string;
  annualSavings: string;
  description: string;
  sms: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

export function PricingSection({ plans }: { plans: PricingPlan[] }) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  return (
    <>
      {/* Toggle */}
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <span className={`text-sm font-black ${interval === 'monthly' ? 'text-[#171713]' : 'text-[#77786F]'}`}>
          Monthly
        </span>
        <button
          onClick={() => setInterval((current) => current === 'monthly' ? 'annual' : 'monthly')}
          className={`relative inline-flex h-7 w-12 items-center rounded-full border-2 border-[#171713] transition-colors ${
            interval === 'annual' ? 'bg-[#F05A37]' : 'bg-[#D8D2C5]'
          }`}
          aria-label="Toggle annual billing"
          aria-pressed={interval === 'annual'}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            interval === 'annual' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <span className={`text-sm font-black ${interval === 'annual' ? 'text-[#171713]' : 'text-[#77786F]'}`}>
          Annual
        </span>
        <span className="ml-1 border border-[#171713] bg-[#DCE7A3] px-2.5 py-1 text-xs font-black">
          2 months free
        </span>
      </div>

      {/* Cards */}
      <div className="grid border-l-2 border-t-2 border-[#171713] sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const price = interval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
          const period = interval === 'annual' ? plan.annualPeriod : plan.monthlyPeriod;

          return (
            <div
              key={plan.name}
              className={`relative flex min-h-[520px] flex-col border-b-2 border-r-2 border-[#171713] p-6 ${
                plan.highlighted
                  ? 'bg-[#F05A37] text-[#171713]'
                  : 'bg-[#F6F0E4] text-[#171713]'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute right-4 top-4 -rotate-3 border-2 border-[#171713] bg-[#DCE7A3] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0_#171713]">Most popular</div>
              )}
              <h3 className="text-sm font-black uppercase tracking-[.14em]">{plan.name}</h3>
              <div className="mt-2 mb-1">
                <span className="font-serif text-5xl tracking-[-.05em]">{price}</span>
                <span className="text-sm text-[#62635B]">
                  {period}
                </span>
              </div>
              {interval === 'annual' && plan.annualSavings && (
                <p className="mb-1 text-xs font-black">
                  {plan.annualSavings}
                </p>
              )}
              <p className="mb-4 min-h-10 text-sm font-semibold leading-5 text-[#55564F]">
                {plan.description}
              </p>
              <div className="mb-5 inline-block w-fit border border-[#171713] bg-[#FFFBF3] px-3 py-1.5 text-xs font-black">
                {plan.sms}
              </div>
              <ul className="mb-6 flex-1 space-y-3 border-t border-[#171713]/25 pt-5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="font-semibold text-[#45463F]">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`block border-2 border-[#171713] py-3 text-center text-sm font-black shadow-[3px_3px_0_#171713] transition-transform hover:-translate-y-0.5 ${
                  plan.highlighted
                    ? 'bg-[#171713] text-[#F6F0E4]'
                    : 'bg-[#FFFBF3] text-[#171713]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
