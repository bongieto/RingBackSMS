'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import { Phone, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { phoneApi } from '@/lib/api';

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
}

interface PhoneStatus {
  hasPhoneNumber: boolean;
  phoneNumber: string | null;
  subAccountSid: string | null;
}

export default function PhoneSetupPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const [areaCode, setAreaCode] = useState('');
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<PhoneStatus>({
    queryKey: ['phone-status', tenantId],
    queryFn: () => phoneApi.getStatus(tenantId!),
    enabled: !!tenantId,
  });

  const searchMutation = useMutation({
    mutationFn: () => phoneApi.search(tenantId!, areaCode),
    onError: () => toast.error('Failed to search for available numbers'),
  });

  const provisionMutation = useMutation({
    mutationFn: (phoneNumber: string) => phoneApi.provision(tenantId!, phoneNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-status', tenantId] });
      toast.success('Phone number provisioned successfully!');
      setSelectedNumber(null);
      searchMutation.reset();
    },
    onError: () => toast.error('Failed to provision phone number'),
  });

  const handleSearch = () => {
    if (areaCode.length !== 3) {
      toast.error('Please enter a valid 3-digit area code');
      return;
    }
    setSelectedNumber(null);
    searchMutation.mutate();
  };

  const handleProvision = () => {
    if (!selectedNumber) return;
    provisionMutation.mutate(selectedNumber);
  };

  if (statusLoading) {
    return (
      <div>
        <Header title="Phone Number" description="Manage your RingBackSMS phone number" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Tenant already has a phone number
  if (status?.hasPhoneNumber) {
    return (
      <div>
        <Header title="Phone Number" description="Manage your RingBackSMS phone number" />
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Your RingBackSMS Number
              </CardTitle>
              <CardDescription>This number is used for missed-call SMS replies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold tracking-wide text-gray-900">
                  {status.phoneNumber}
                </span>
                <Badge variant="success">Active</Badge>
              </div>
              {status.subAccountSid && (
                <p className="text-xs text-muted-foreground">
                  Sub-account: {status.subAccountSid}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Phone className="h-5 w-5" />
                Forward Your Business Phone
              </CardTitle>
              <CardDescription className="text-blue-800">
                Set up call forwarding so unanswered calls to your existing business number go to your RingbackSMS number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-blue-900">
              <div className="space-y-2">
                <p className="font-medium">Option A: Conditional forwarding (recommended)</p>
                <p>Forward calls only when you don&apos;t answer. On most phones, dial:</p>
                <code className="block bg-blue-100 rounded px-3 py-2 font-mono text-sm">
                  *67*{status.phoneNumber}#
                </code>
                <p className="text-xs text-blue-700">This keeps your normal number &mdash; RingbackSMS only picks up when you can&apos;t.</p>
              </div>
              <div className="space-y-2 pt-2 border-t border-blue-200">
                <p className="font-medium">Option B: Phone settings</p>
                <p>Go to your phone&apos;s <strong>Call Settings &rarr; Call Forwarding &rarr; Forward when unanswered</strong> and enter your RingbackSMS number: <strong>{status.phoneNumber}</strong></p>
              </div>
              <div className="space-y-2 pt-2 border-t border-blue-200">
                <p className="font-medium">Option C: Carrier forwarding</p>
                <p>Contact your phone carrier and ask them to enable &quot;no-answer forwarding&quot; to <strong>{status.phoneNumber}</strong></p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Setup wizard
  const availableNumbers: AvailableNumber[] = searchMutation.data ?? [];

  return (
    <div>
      <Header title="Phone Number" description="Set up your RingBackSMS phone number" />

      <div className="space-y-6 max-w-2xl">
        {/* Step 1: Search */}
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Search for a Number</CardTitle>
            <CardDescription>
              Enter a 3-digit area code to find available phone numbers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <Label>Area Code</Label>
                <Input
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="512"
                  maxLength={3}
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={areaCode.length !== 3 || searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Searching...
                  </>
                ) : (
                  'Search Available Numbers'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Select a number */}
        {searchMutation.isSuccess && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Select a Number</CardTitle>
              <CardDescription>
                {availableNumbers.length > 0
                  ? `Found ${availableNumbers.length} available numbers`
                  : 'No numbers found for this area code. Try a different one.'}
              </CardDescription>
            </CardHeader>
            {availableNumbers.length > 0 && (
              <CardContent className="space-y-2">
                {availableNumbers.map((num) => (
                  <button
                    key={num.phoneNumber}
                    type="button"
                    onClick={() => setSelectedNumber(num.phoneNumber)}
                    className={`w-full flex items-center justify-between rounded-lg border p-4 text-left transition-colors ${
                      selectedNumber === num.phoneNumber
                        ? 'border-primary bg-primary/5 ring-2 ring-primary'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div>
                      <p className="font-mono text-lg font-semibold">{num.phoneNumber}</p>
                      <p className="text-sm text-muted-foreground">{num.friendlyName}</p>
                    </div>
                    {selectedNumber === num.phoneNumber && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        {/* Step 3: Provision */}
        {selectedNumber && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Provision Number</CardTitle>
              <CardDescription>
                Confirm your selection and activate the number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-sm text-yellow-800">
                  Provisioning a phone number costs <strong>$1.15/month</strong> (Twilio pricing).
                  This will be billed to your Twilio account.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-semibold">{selectedNumber}</span>
              </div>

              <Button
                onClick={handleProvision}
                disabled={provisionMutation.isPending}
                size="lg"
              >
                {provisionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Provisioning... (this may take a few seconds)
                  </>
                ) : (
                  'Provision This Number'
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
