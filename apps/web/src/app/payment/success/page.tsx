import { CheckCircle } from 'lucide-react';

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Payment Received!</h1>
        <p className="text-muted-foreground">
          Thank you for your payment. Your order has been confirmed and the business has been notified.
          You can close this page.
        </p>
      </div>
    </div>
  );
}
