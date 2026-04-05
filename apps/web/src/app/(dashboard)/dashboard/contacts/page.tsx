'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import {
  Users,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Mail,
  Phone,
  StickyNote,
  ShoppingBag,
  DollarSign,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contactApi } from '@/lib/api';
import { cn, formatCurrency, formatDate, formatRelativeTime, maskPhone } from '@/lib/utils';

interface Contact {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  totalOrders: number;
  totalSpent: number;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  conversationCount?: number;
  orderCount?: number;
}

interface PaginatedResponse {
  success: boolean;
  data: Contact[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-red-100 text-red-700',
  'bg-yellow-100 text-yellow-700',
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function ContactsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const pageSize = 20;

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch contacts list
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['contacts', tenantId, search, tagFilter, page],
    queryFn: () =>
      contactApi.list(tenantId!, {
        search: search || undefined,
        tag: tagFilter || undefined,
        page,
        pageSize,
      }),
    enabled: !!tenantId,
  });

  // Fetch selected contact detail
  const { data: selectedContact } = useQuery<Contact>({
    queryKey: ['contact', selectedId],
    queryFn: () => contactApi.get(selectedId!),
    enabled: !!selectedId,
  });

  // Collect all unique tags for filter dropdown
  const allTags = Array.from(
    new Set((data?.data ?? []).flatMap((c) => c.tags))
  ).sort();

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newContact: Record<string, unknown>) => contactApi.create(newContact),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setShowCreateForm(false);
      showToast('Contact created');
    },
    onError: () => showToast('Failed to create contact', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      contactApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', selectedId] });
      showToast('Contact saved');
    },
    onError: () => showToast('Failed to save contact', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setSelectedId(null);
      showToast('Contact deleted');
    },
    onError: () => showToast('Failed to delete contact', 'error'),
  });

  const contacts = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <Header
        title="Contacts"
        description="Manage your customer contacts"
        action={
          <Button onClick={() => setShowCreateForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Contact
          </Button>
        }
      />

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all',
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-4">
        {/* Contacts table */}
        <Card className={cn('flex-1', selectedId && 'max-w-[60%]')}>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Loading contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground font-medium">No contacts yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Contacts are created automatically when customers text you, or add them manually.
                </p>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tags</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Orders</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Spent</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Last Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr
                        key={contact.id}
                        onClick={() => setSelectedId(contact.id)}
                        className={cn(
                          'border-b cursor-pointer hover:bg-muted/30 transition-colors',
                          selectedId === contact.id && 'bg-blue-50'
                        )}
                      >
                        <td className="px-4 py-3 font-medium">
                          {contact.name || maskPhone(contact.phone)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {maskPhone(contact.phone)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {contact.email || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {contact.tags.map((tag) => (
                              <span
                                key={tag}
                                className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                  getTagColor(tag)
                                )}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">{contact.totalOrders}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(contact.totalSpent)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {contact.lastContactAt ? formatRelativeTime(contact.lastContactAt) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(pagination.page - 1) * pagination.pageSize + 1}-
                      {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                      {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selectedId && selectedContact && (
          <ContactDetailPanel
            contact={selectedContact}
            onClose={() => setSelectedId(null)}
            onSave={(data) => updateMutation.mutate({ id: selectedContact.id, data })}
            onDelete={() => {
              if (confirm('Are you sure you want to delete this contact?')) {
                deleteMutation.mutate(selectedContact.id);
              }
            }}
            isSaving={updateMutation.isPending}
          />
        )}
      </div>

      {/* Create contact modal */}
      {showCreateForm && tenantId && (
        <CreateContactModal
          tenantId={tenantId}
          onClose={() => setShowCreateForm(false)}
          onCreate={(data) => createMutation.mutate(data)}
          isCreating={createMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

function ContactDetailPanel({
  contact,
  onClose,
  onSave,
  onDelete,
  isSaving,
}: {
  contact: Contact;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(contact.name ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [newTag, setNewTag] = useState('');

  // Sync state when contact changes
  const [prevId, setPrevId] = useState(contact.id);
  if (contact.id !== prevId) {
    setPrevId(contact.id);
    setName(contact.name ?? '');
    setEmail(contact.email ?? '');
    setNotes(contact.notes ?? '');
    setTags(contact.tags);
    setNewTag('');
  }

  const handleSave = () => {
    onSave({ name: name || null, email: email || null, notes: notes || null, tags });
  };

  const addTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <Card className="w-[40%] min-w-[320px]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Contact Details</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Activity summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <ShoppingBag className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-semibold">{contact.totalOrders}</p>
            <p className="text-xs text-muted-foreground">Orders</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-semibold">{formatCurrency(contact.totalSpent)}</p>
            <p className="text-xs text-muted-foreground">Spent</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-semibold">
              {contact.lastContactAt ? formatRelativeTime(contact.lastContactAt) : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">Last Contact</p>
          </div>
        </div>

        {/* Phone (read-only) */}
        <div className="mb-4">
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Phone className="h-3 w-3" /> Phone
          </Label>
          <p className="text-sm font-medium">{contact.phone}</p>
        </div>

        {/* Editable fields */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="detail-name" className="text-xs text-muted-foreground mb-1 block">
              Name
            </Label>
            <Input
              id="detail-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contact name"
            />
          </div>

          <div>
            <Label htmlFor="detail-email" className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Mail className="h-3 w-3" /> Email
            </Label>
            <Input
              id="detail-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <Label htmlFor="detail-notes" className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <StickyNote className="h-3 w-3" /> Notes
            </Label>
            <textarea
              id="detail-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Tags */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Tags</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    getTagColor(tag)
                  )}
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:opacity-70"
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add tag..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={addTag} type="button">
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Conversations link */}
        {contact.conversationCount !== undefined && contact.conversationCount > 0 && (
          <a
            href={`/dashboard/conversations?phone=${encodeURIComponent(contact.phone)}`}
            className="flex items-center gap-2 mt-4 text-sm text-blue-600 hover:underline"
          >
            <MessageSquare className="h-4 w-4" />
            View {contact.conversationCount} conversation{contact.conversationCount !== 1 ? 's' : ''}
          </a>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create Modal ─────────────────────────────────────────────────────────────

function CreateContactModal({
  tenantId,
  onClose,
  onCreate,
  isCreating,
}: {
  tenantId: string;
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => void;
  isCreating: boolean;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    onCreate({
      tenantId,
      phone: phone.trim(),
      name: name || undefined,
      email: email || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Add Contact</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="create-phone">Phone *</Label>
              <Input
                id="create-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1234567890"
                required
              />
            </div>
            <div>
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contact name"
              />
            </div>
            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <Label htmlFor="create-notes">Notes</Label>
              <textarea
                id="create-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating || !phone.trim()}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
