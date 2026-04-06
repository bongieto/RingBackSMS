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
      <div className="flex items-center justify-center gap-3 mb-12">
        <span className={`text-sm font-medium ${interval === 'monthly' ? 'text-slate-900' : 'text-slate-500'}`}>
          Monthly
        </span>
        <button
          onClick={() => setInterval(interval === 'monthly' ? 'annual' : 'monthly')}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            interval === 'annual' ? 'bg-blue-600' : 'bg-slate-300'
          }`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            interval === 'annual' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <span className={`text-sm font-medium ${interval === 'annual' ? 'text-slate-900' : 'text-slate-500'}`}>
          Annual
        </span>
        <span className="ml-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
          2 months free
        </span>
      </div>

      {/* Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const price = interval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
          const period = interval === 'annual' ? plan.annualPeriod : plan.monthlyPeriod;

          return (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 border-2 flex flex-col ${
                plan.highlighted
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-600/20 scale-[1.02]'
                  : 'bg-white text-slate-900 border-slate-200'
              }`}
            >
              {plan.highlighted && (
                <div className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-2">Most Popular</div>
              )}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="mt-2 mb-1">
                <span className="text-4xl font-extrabold">{price}</span>
                <span className={`text-sm ${plan.highlighted ? 'text-blue-200' : 'text-slate-500'}`}>
                  {period}
                </span>
              </div>
              {interval === 'annual' && plan.annualSavings && (
                <p className={`text-xs font-semibold mb-1 ${plan.highlighted ? 'text-blue-200' : 'text-green-600'}`}>
                  {plan.annualSavings}
                </p>
              )}
              <p className={`text-sm mb-4 ${plan.highlighted ? 'text-blue-200' : 'text-slate-500'}`}>
                {plan.description}
              </p>
              <div className={`text-sm font-semibold mb-4 px-3 py-1.5 rounded-lg inline-block w-fit ${
                plan.highlighted ? 'bg-blue-500' : 'bg-blue-50 text-blue-700'
              }`}>
                {plan.sms}
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlighted ? 'text-blue-200' : 'text-green-500'}`} />
                    <span className={plan.highlighted ? 'text-blue-100' : 'text-slate-600'}>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  plan.highlighted
                    ? 'bg-white text-blue-600 hover:bg-blue-50'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
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
