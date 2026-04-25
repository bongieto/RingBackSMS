'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import { Phone, Loader2, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { phoneApi } from '@/lib/api';
import { CallForwardingWizard } from '@/components/settings/CallForwardingWizard';

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

  const handleCancelSearch = () => {
    searchMutation.reset();
    setSelectedNumber(null);
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
        <div className="max-w-2xl space-y-6">
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

          <CallForwardingWizard tenantPhoneNumber={status.phoneNumber!} />
        </div>
      </div>
    );
  }

  // Setup wizard
  const searchResult = searchMutation.data;
  const availableNumbers = searchResult?.numbers ?? [];
  const isAlternative = searchResult?.isAlternative ?? false;

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
              {searchMutation.isPending ? (
                <div className="flex gap-2">
                  <Button disabled>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Searching...
                  </Button>
                  <Button variant="outline" onClick={handleCancelSearch}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleSearch}
                  disabled={areaCode.length !== 3}
                >
                  Search Available Numbers
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Select a number */}
        {searchMutation.isSuccess && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Select a Number</CardTitle>
              <CardDescription>
                {availableNumbers.length > 0 && !isAlternative
                  ? `Found ${availableNumbers.length} available numbers in ${searchResult?.searchedAreaCode}`
                  : availableNumbers.length === 0
                    ? `No numbers available in or near area code ${searchResult?.searchedAreaCode}. Try a different area code.`
                    : `Found ${availableNumbers.length} nearby numbers`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Alternative area code info banner */}
              {isAlternative && availableNumbers.length > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">No numbers available in area code {searchResult?.searchedAreaCode}</p>
                    <p className="mt-1">Here are nearby numbers from your area. These serve the same geographic region with a different area code.</p>
                  </div>
                </div>
              )}

              {/* No results at all */}
              {availableNumbers.length === 0 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">No numbers found</p>
                    <p className="mt-1">Try a different area code, or use a nearby major city&apos;s area code.</p>
                  </div>
                </div>
              )}

              {/* Number list */}
              {availableNumbers.length > 0 && (
                <div className="space-y-2">
                  {availableNumbers.map((num) => {
                    const numAreaCode = num.phoneNumber.slice(2, 5);
                    return (
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
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-lg font-semibold">{num.phoneNumber}</p>
                            {isAlternative && (
                              <Badge variant="secondary" className="text-xs">
                                {numAreaCode}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{num.friendlyName}</p>
                        </div>
                        {selectedNumber === num.phoneNumber && (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
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
