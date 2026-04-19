'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Smartphone, RefreshCw } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PairingCodeResponse {
  success: boolean;
  data?: { code: string; expiresAt: string };
  error?: string;
}

export default function DevicesSettingsPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/devices/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json: PairingCodeResponse = await res.json();
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Could not generate pairing code');
        return;
      }
      setCode(json.data.code);
      setExpiresAt(json.data.expiresAt);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }

  const qrPayload = code ? JSON.stringify({ code }) : '';
  const humanExpiry = expiresAt ? new Date(expiresAt).toLocaleTimeString() : null;

  return (
    <div className="flex flex-col gap-6">
      <Header title="Connect a mobile device" description="Pair the RingbackSMS Kitchen Android app." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Pairing code
          </CardTitle>
          <CardDescription>
            Generate a one-time 6-digit code, then enter it on the mobile app. The code is valid for ~10 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!code && (
            <Button onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate pairing code'}
            </Button>
          )}

          {code && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-4xl font-mono tracking-widest font-semibold">
                {code.slice(0, 3)} {code.slice(3)}
              </div>
              {humanExpiry && (
                <p className="text-sm text-muted-foreground">Expires around {humanExpiry}</p>
              )}
              <QRCodeSVG value={qrPayload} size={180} includeMargin={false} level="M" />
              <p className="text-xs text-muted-foreground text-center max-w-sm">
                Enter the code on the mobile app, or scan the QR. The code can only be used once.
              </p>
              <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {loading ? 'Generating…' : 'Generate a new code'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
