export default function OrderNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900">Order not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may have expired. Text the business directly if you need help.
        </p>
      </div>
    </div>
  );
}
