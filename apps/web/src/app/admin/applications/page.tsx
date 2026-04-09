'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface AgencyApplication {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string;
  companyName: string | null;
  website: string | null;
  pitch: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes: string | null;
  createdAt: string;
}

export default function AdminApplicationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'PENDING',
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<AgencyApplication[]>({
    queryKey: ['admin-applications', filter],
    queryFn: () =>
      api
        .get('/admin/applications', {
          params: filter === 'all' ? {} : { status: filter },
        })
        .then((r) => r.data.data),
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/applications/${id}/approve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-applications'] });
      toast.success('Application approved');
    },
    onError: () => toast.error('Failed to approve'),
  });

  const reject = useMutation({
    mutationFn: ({ id, notes: n }: { id: string; notes?: string }) =>
      api.post(`/admin/applications/${id}/reject`, { notes: n }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-applications'] });
      toast.success('Application rejected');
    },
    onError: () => toast.error('Failed to reject'),
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Partner Applications</h1>
        <p className="text-slate-400 text-sm mt-1">
          Review and approve new agency partner applications.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No applications.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {rows.map((a) => (
              <div key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium">
                      {a.fullName}
                      {a.companyName && (
                        <span className="text-slate-400 font-normal">
                          {' · '}
                          {a.companyName}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {a.email}
                      {a.website && (
                        <>
                          {' · '}
                          <a
                            href={a.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-400 underline"
                          >
                            {a.website}
                          </a>
                        </>
                      )}
                      {' · '}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                    <button
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                    >
                      {expanded === a.id ? 'Hide pitch' : 'Read pitch'}
                    </button>
                    {expanded === a.id && (
                      <div className="mt-3 p-3 bg-slate-800 rounded text-sm text-slate-300 whitespace-pre-wrap">
                        {a.pitch}
                      </div>
                    )}
                    {a.reviewNotes && (
                      <div className="text-xs text-slate-500 mt-2 italic">
                        Notes: {a.reviewNotes}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {a.status === 'PENDING' ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(a.id)}
                        >
                          Approve
                        </Button>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={notes[a.id] ?? ''}
                            onChange={(e) =>
                              setNotes({ ...notes, [a.id]: e.target.value })
                            }
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-40"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 text-slate-300"
                            disabled={reject.isPending}
                            onClick={() =>
                              reject.mutate({ id: a.id, notes: notes[a.id] })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </>
                    ) : (
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          a.status === 'APPROVED'
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {a.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
