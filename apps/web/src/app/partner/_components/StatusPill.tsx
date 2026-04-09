export function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'PAID'
      ? 'bg-green-500/20 text-green-300'
      : status === 'PENDING'
        ? 'bg-yellow-500/20 text-yellow-300'
        : 'bg-slate-500/20 text-slate-400';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
