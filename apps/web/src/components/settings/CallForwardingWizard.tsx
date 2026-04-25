'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Phone,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  RotateCcw,
  Smartphone,
  Info,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  generateForwardingCode,
  RING_DELAY_OPTIONS,
  DEFAULT_RING_DELAY_SECONDS,
  type Carrier,
  type ForwardingAction,
} from '@ringback/flow-engine';

type Platform = 'ios' | 'android';
type Step = 'PLATFORM' | 'CARRIER' | 'ACTION' | 'RING_DELAY' | 'NUMBER' | 'RESULT';

interface Props {
  /** The tenant's RingbackSMS Twilio number — used to pre-fill the
   *  forwarding destination so the user usually just clicks through. */
  tenantPhoneNumber: string;
}

const CARRIER_LABELS: Record<Carrier, string> = {
  att: 'AT&T',
  verizon: 'Verizon',
  tmobile: 'T-Mobile',
  other: 'Other / Not sure',
};

const ACTION_LABELS: Record<ForwardingAction, string> = {
  forward_missed: 'Forward missed/unanswered calls only',
  forward_all: 'Forward all calls immediately',
  turn_off: 'Turn off call forwarding',
  check_status: 'Check current forwarding setting',
};

const ACTION_DESCRIPTIONS: Record<ForwardingAction, string> = {
  forward_missed:
    'Recommended. Customers reach you first; only unanswered calls go to RingbackSMS.',
  forward_all: 'Every call routes to RingbackSMS without ringing your phone.',
  turn_off: 'Disable call forwarding on your line.',
  check_status: 'Ask your carrier what forwarding (if any) is currently active.',
};

export function CallForwardingWizard({ tenantPhoneNumber }: Props) {
  const [step, setStep] = useState<Step>('PLATFORM');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [action, setAction] = useState<ForwardingAction | null>(null);
  const [ringDelay, setRingDelay] = useState<number>(DEFAULT_RING_DELAY_SECONDS);
  const [forwardingNumber, setForwardingNumber] = useState<string>(tenantPhoneNumber);
  const [copied, setCopied] = useState(false);

  // Pre-flight call to know which downstream steps to skip. Pure function,
  // safe to call before all inputs are gathered.
  const preview = useMemo(() => {
    if (!carrier || !action) return null;
    return generateForwardingCode({
      carrier,
      action,
      ringDelaySeconds: ringDelay,
      forwardingNumber,
    });
  }, [carrier, action, ringDelay, forwardingNumber]);

  const result = useMemo(() => {
    if (step !== 'RESULT' || !carrier || !action) return null;
    return generateForwardingCode({
      carrier,
      action,
      ringDelaySeconds: ringDelay,
      forwardingNumber,
    });
  }, [step, carrier, action, ringDelay, forwardingNumber]);

  function reset() {
    setStep('PLATFORM');
    setPlatform(null);
    setCarrier(null);
    setAction(null);
    setRingDelay(DEFAULT_RING_DELAY_SECONDS);
    setForwardingNumber(tenantPhoneNumber);
    setCopied(false);
  }

  function goBack() {
    const order: Step[] = ['PLATFORM', 'CARRIER', 'ACTION', 'RING_DELAY', 'NUMBER', 'RESULT'];
    const idx = order.indexOf(step);
    if (idx <= 0) return;
    // Walk backward, skipping any step that doesn't apply to the current
    // carrier/action combo. Mirrors the forward-skip logic.
    for (let i = idx - 1; i >= 0; i--) {
      const candidate = order[i];
      if (candidate === 'RING_DELAY' && !preview?.needsRingDelay) continue;
      if (candidate === 'NUMBER' && !preview?.needsForwardingNumber) continue;
      setStep(candidate);
      return;
    }
  }

  function goNext() {
    if (step === 'PLATFORM' && platform) {
      setStep('CARRIER');
      return;
    }
    if (step === 'CARRIER' && carrier) {
      setStep('ACTION');
      return;
    }
    if (step === 'ACTION' && carrier && action) {
      // We have to recompute preview here because state setters above are
      // batched; the closure captured by useMemo may not have updated yet.
      const fresh = generateForwardingCode({
        carrier,
        action,
        ringDelaySeconds: ringDelay,
        forwardingNumber,
      });
      if (fresh.needsRingDelay) {
        setStep('RING_DELAY');
        return;
      }
      if (fresh.needsForwardingNumber) {
        setStep('NUMBER');
        return;
      }
      setStep('RESULT');
      return;
    }
    if (step === 'RING_DELAY') {
      if (preview?.needsForwardingNumber) {
        setStep('NUMBER');
      } else {
        setStep('RESULT');
      }
      return;
    }
    if (step === 'NUMBER' && forwardingNumber.trim().length > 0) {
      setStep('RESULT');
      return;
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn\u2019t copy automatically — long-press the code to copy.');
    }
  }

  const stepNumber = stepIndex(step, preview);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Set up call forwarding
        </CardTitle>
        <CardDescription>
          Generate the right dial code for your carrier so unanswered calls go
          to your RingbackSMS number.
        </CardDescription>
        <div className="text-xs text-muted-foreground pt-1">{stepNumber}</div>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 'PLATFORM' && (
          <Section title="Which phone are you setting up?">
            <PickerRow>
              <PickerButton
                selected={platform === 'ios'}
                onClick={() => setPlatform('ios')}
                label="iPhone (iOS)"
                icon={<Smartphone className="h-5 w-5" />}
              />
              <PickerButton
                selected={platform === 'android'}
                onClick={() => setPlatform('android')}
                label="Android"
                icon={<Smartphone className="h-5 w-5" />}
              />
            </PickerRow>
          </Section>
        )}

        {step === 'CARRIER' && (
          <Section title="Who is your cellular carrier?">
            <PickerRow>
              {(Object.keys(CARRIER_LABELS) as Carrier[]).map((c) => (
                <PickerButton
                  key={c}
                  selected={carrier === c}
                  onClick={() => setCarrier(c)}
                  label={CARRIER_LABELS[c]}
                />
              ))}
            </PickerRow>
          </Section>
        )}

        {step === 'ACTION' && (
          <Section title="What do you want to do?">
            <div className="space-y-2">
              {(Object.keys(ACTION_LABELS) as ForwardingAction[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    action === a
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-input hover:bg-muted/40'
                  }`}
                >
                  <div className="font-medium text-sm">{ACTION_LABELS[a]}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {ACTION_DESCRIPTIONS[a]}
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {step === 'RING_DELAY' && (
          <Section
            title="How long should your phone ring before forwarding?"
            subtitle={`Recommended: ${DEFAULT_RING_DELAY_SECONDS} seconds (about 4 rings) for service businesses.`}
          >
            <PickerRow>
              {RING_DELAY_OPTIONS.map((s) => {
                const rings = Math.round(s / 5);
                return (
                  <PickerButton
                    key={s}
                    selected={ringDelay === s}
                    onClick={() => setRingDelay(s)}
                    label={`${s} sec (~${rings} ring${rings === 1 ? '' : 's'})`}
                  />
                );
              })}
            </PickerRow>
          </Section>
        )}

        {step === 'NUMBER' && (
          <Section
            title="Forward calls to which number?"
            subtitle="We've pre-filled your RingbackSMS number. You can change it if you want to forward to a different destination."
          >
            <div className="space-y-2 max-w-md">
              <Label htmlFor="forwarding-number">Forwarding number</Label>
              <Input
                id="forwarding-number"
                value={forwardingNumber}
                onChange={(e) => setForwardingNumber(e.target.value)}
                placeholder="+1 555 123 4567"
                inputMode="tel"
              />
              {forwardingNumber !== tenantPhoneNumber && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setForwardingNumber(tenantPhoneNumber)}
                >
                  Reset to RingbackSMS number ({tenantPhoneNumber})
                </button>
              )}
            </div>
          </Section>
        )}

        {step === 'RESULT' && result && (
          <ResultStep
            platform={platform!}
            carrierLabel={CARRIER_LABELS[carrier!]}
            actionLabel={ACTION_LABELS[action!]}
            result={result}
            copied={copied}
            onCopy={copyCode}
            onReset={reset}
          />
        )}

        {/* Nav buttons (hidden on the result step — that has its own controls) */}
        {step !== 'RESULT' && (
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={step === 'PLATFORM'}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={goNext} disabled={!canAdvance(step, { platform, carrier, action, forwardingNumber })}>
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Result step ────────────────────────────────────────────────────────────

function ResultStep(props: {
  platform: Platform;
  carrierLabel: string;
  actionLabel: string;
  result: NonNullable<ReturnType<typeof generateForwardingCode>>;
  copied: boolean;
  onCopy: (code: string) => void;
  onReset: () => void;
}) {
  const { platform, carrierLabel, actionLabel, result, copied, onCopy, onReset } = props;

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{carrierLabel}</span> &middot;{' '}
        {actionLabel}
      </div>

      {result.code ? (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {result.description}
          </div>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 bg-muted/40 border-2 border-dashed border-blue-300 rounded-lg p-4 font-mono text-2xl tracking-wide text-center break-all">
              {result.code}
            </div>
            <Button
              variant="outline"
              className="self-stretch px-4"
              onClick={() => onCopy(result.code!)}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy code
                </>
              )}
            </Button>
          </div>
          {result.fallbackCode && (
            <div className="text-xs text-muted-foreground">
              Fallback if the code above doesn&apos;t work:{' '}
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
                {result.fallbackCode}
              </code>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <div className="font-medium">No automatic code available</div>
          {result.note && <p className="mt-1 text-amber-800">{result.note}</p>}
        </div>
      )}

      {result.note && result.code && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{result.note}</span>
        </div>
      )}

      {result.troubleshooting && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Troubleshooting: </span>
            {result.troubleshooting}
          </span>
        </div>
      )}

      {/* How to dial */}
      <div className="space-y-2">
        <div className="text-sm font-medium">How to use this code on {platform === 'ios' ? 'iPhone' : 'Android'}</div>
        <ol className="list-decimal pl-6 text-sm text-muted-foreground space-y-1">
          {platform === 'ios' ? (
            <>
              <li>Open the Phone app.</li>
              <li>Tap Keypad.</li>
              <li>Paste or type the code above.</li>
              <li>Press the green Call button.</li>
              <li>Wait for the carrier confirmation message.</li>
            </>
          ) : (
            <>
              <li>Open the Phone (or Dialer) app.</li>
              <li>Tap the keypad.</li>
              <li>Paste or type the code above.</li>
              <li>Tap the call button.</li>
              <li>Wait for the carrier confirmation.</li>
            </>
          )}
        </ol>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground border-l-2 border-muted-foreground/20 pl-3 leading-relaxed">
        Call forwarding is controlled by your cellular carrier. Some codes may
        vary by plan, account type, or region. If the code fails, contact your
        carrier and ask whether conditional call forwarding is enabled.
      </div>

      <div className="flex justify-start pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Start over
        </Button>
      </div>
    </div>
  );
}

// ── Internal helpers ───────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function PickerRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function PickerButton({
  selected,
  onClick,
  label,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 text-blue-900'
          : 'border-input hover:bg-muted/40'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function canAdvance(
  step: Step,
  values: {
    platform: Platform | null;
    carrier: Carrier | null;
    action: ForwardingAction | null;
    forwardingNumber: string;
  },
): boolean {
  switch (step) {
    case 'PLATFORM':
      return !!values.platform;
    case 'CARRIER':
      return !!values.carrier;
    case 'ACTION':
      return !!values.action;
    case 'RING_DELAY':
      return true; // ringDelay always has a default
    case 'NUMBER':
      return values.forwardingNumber.trim().length > 0;
    case 'RESULT':
      return false;
  }
}

function stepIndex(
  step: Step,
  preview: ReturnType<typeof generateForwardingCode> | null,
): string {
  // Determine the active step ordering — RING_DELAY/NUMBER may be skipped
  // depending on the carrier+action combo, which keeps the "Step X of N"
  // counter honest.
  const sequence: Step[] = ['PLATFORM', 'CARRIER', 'ACTION'];
  if (preview?.needsRingDelay) sequence.push('RING_DELAY');
  if (preview?.needsForwardingNumber) sequence.push('NUMBER');
  sequence.push('RESULT');
  const idx = sequence.indexOf(step);
  if (idx < 0) return '';
  return `Step ${idx + 1} of ${sequence.length}`;
}
