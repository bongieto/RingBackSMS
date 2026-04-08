'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  isAgency: boolean;
  orgCount: number;
  createdAt: number | string;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data.data as AdminUser[]),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isAgency }: { id: string; isAgency: boolean }) =>
      api.patch(`/admin/users/${id}/agency`, { isAgency }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  const users = data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-slate-400 text-sm mt-1">
          {users.length} total · Toggle agency access to let a user own more than one organization.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3 text-right">Orgs</th>
                  <th className="px-5 py-3">Agency</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50 text-sm"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-white">{u.name ?? '—'}</div>
                      <div className="text-xs text-slate-500 font-mono">{u.id}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{u.email ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{u.orgCount}</td>
                    <td className="px-5 py-3">
                      <Button
                        size="sm"
                        variant={u.isAgency ? 'default' : 'outline'}
                        className={
                          u.isAgency
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'border-slate-700 text-slate-300'
                        }
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({ id: u.id, isAgency: !u.isAgency })
                        }
                      >
                        {u.isAgency ? 'Agency ✓' : 'Grant agency'}
                      </Button>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
