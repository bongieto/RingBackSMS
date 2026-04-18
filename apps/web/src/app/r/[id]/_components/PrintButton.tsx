'use client';

export function PrintButton() {
  return (
    <button
      className="text-xs text-slate-500 underline"
      onClick={() => {
        if (typeof window !== 'undefined') window.print();
      }}
    >
      Save or print this receipt
    </button>
  );
}
