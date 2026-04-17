import Link from 'next/link';

export default function MenuNotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900">Menu not found</h1>
        <p className="text-slate-600 mt-2">
          This menu link is invalid or no longer available.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm hover:bg-slate-800"
        >
          Back to RingBackSMS
        </Link>
      </div>
    </div>
  );
}
