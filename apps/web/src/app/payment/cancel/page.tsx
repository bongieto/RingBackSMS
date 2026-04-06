import { XCircle } from 'lucide-react';

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <XCircle className="h-16 w-16 text-slate-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Payment Cancelled</h1>
        <p className="text-muted-foreground">
          No worries — your order is still placed. You can pay at pickup or contact the business
          via text if you need a new payment link.
        </p>
      </div>
    </div>
  );
}
