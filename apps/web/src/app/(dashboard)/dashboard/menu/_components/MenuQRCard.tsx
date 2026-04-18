'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, Download } from 'lucide-react';

/**
 * Renders the tenant's public-menu QR code + a download + copy button.
 * Lives inside Menus tab so operators can print it for their truck window.
 * Intentionally renders as SVG (vector) then converts to PNG for download
 * so the printed version stays crisp at any size.
 */
export function MenuQRCard({ slug }: { slug: string | null }) {
  const svgRef = useRef<HTMLDivElement>(null);

  if (!slug) return null;
  const url =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}/m/${slug}`
      : `/m/${slug}`;

  const copy = () => {
    navigator.clipboard.writeText(url).then(
      () => toast.success('Menu link copied'),
      () => toast.error('Copy failed'),
    );
  };

  const download = () => {
    const svgEl = svgRef.current?.querySelector('svg');
    if (!svgEl) return toast.error('QR not ready');
    // Serialize the SVG, rasterize to canvas at 2x for print quality
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 1024; // High-res PNG for poster-quality print
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        return toast.error('Canvas unavailable');
      }
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) return toast.error('Export failed');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `menu-qr-${slug}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = svgUrl;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <QrCode className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Menu QR code</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Print this on your truck window, table cards, or receipts. Customers scan it and go straight to your menu.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            ref={svgRef}
            className="bg-white p-3 rounded-lg border shrink-0"
          >
            <QRCodeSVG value={url} size={180} includeMargin={false} level="M" />
          </div>
          <div className="flex-1 min-w-0 w-full">
            <div className="text-xs text-muted-foreground mb-1">Menu link</div>
            <div className="font-mono text-sm bg-muted rounded px-2 py-1.5 truncate mb-3">
              {url}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="h-4 w-4 mr-1.5" /> Copy link
              </Button>
              <Button size="sm" onClick={download}>
                <Download className="h-4 w-4 mr-1.5" /> Download PNG
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
