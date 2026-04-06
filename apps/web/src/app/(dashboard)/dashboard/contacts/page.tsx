'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Users, Phone, Mail, Tag, X, Plus, ChevronLeft, ChevronRight,
  MessageSquare, ShoppingBag, Calendar, Trash2, Send, Download,
  Clock, User, Star, UserX, UserCheck, FileText, Activity,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { contactApi } from '@/lib/api';
import { cn, formatCurrency, maskPhone, formatRelativeTime } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type ContactStatus = 'LEAD' | 'CUSTOMER' | 'VIP' | 'INACTIVE';

interface Contact {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  status: ContactStatus;
  tags: string[];
  totalOrders: number;
  totalSpent: number;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  conversationCount?: number;
  orderCount?: number;
}

interface ContactNote {
  id: string;
  contactId: string;
  tenantId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

type ActivityItem =
  | { type: 'conversation'; id: string; summary: string; occurredAt: string }
  | { type: 'order'; id: string; orderNumber: string; total: number; status: string; occurredAt: string }
  | { type: 'meeting'; id: string; scheduledAt: string | null; status: string; occurredAt: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ContactStatus, { label: string; color: string; icon: React.ElementType }> = {
  LEAD:     { label: 'Lead',     color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: User },
  CUSTOMER: { label: 'Customer', color: 'bg-green-100 text-green-700 border-green-200',    icon: UserCheck },
  VIP:      { label: 'VIP',      color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Star },
  INACTIVE: { label: 'Inactive', color: 'bg-gray-100 text-gray-500 border-gray-200',       icon: UserX },
};

const ALL_STATUSES: ContactStatus[] = ['LEAD', 'CUSTOMER', 'VIP', 'INACTIVE'];

// ── Helper ────────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', tenantId, search, tagFilter, statusFilter, page],
    queryFn: () => contactApi.list(tenantId!, {
      search: search || undefined,
      tag: tagFilter || undefined,
      status: statusFilter || undefined,
      page,
      pageSize: 20,
    }),
    enabled: !!tenantId,
  });

  const contacts: Contact[] = data?.data ?? [];
  const total: number = data?.pagination?.total ?? 0;
  const totalPages: number = data?.pagination?.totalPages ?? 1;

  const { data: selectedContact } = useQuery<Contact>({
    queryKey: ['contact', selectedId],
    queryFn: () => contactApi.get(selectedId!),
    enabled: !!selectedId,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, ...updates }: Partial<Contact> & { id: string }) =>
      contactApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['contact', selectedId] });
      toast.success('Contact saved');
    },
    onError: () => toast.error('Failed to save contact'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', tenantId] });
      setSelectedId(null);
      toast.success('Contact deleted');
    },
    onError: () => toast.error('Failed to delete contact'),
  });

  const sendSmsMutation = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      contactApi.sendSms(id, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', selectedId] });
      toast.success('SMS sent');
      setShowSmsModal(false);
    },
    onError: () => toast.error('Failed to send SMS'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, value }: { action: 'tag' | 'status' | 'delete'; value?: string }) =>
      contactApi.bulk(tenantId!, Array.from(selectedIds), action, value),
    onSuccess: (data, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', tenantId] });
      setSelectedIds(new Set());
      setBulkTag('');
      setBulkStatus('');
      const count = data?.affected ?? 0;
      toast.success(`${action === 'delete' ? 'Deleted' : 'Updated'} ${count} contact${count !== 1 ? 's' : ''}`);
    },
    onError: () => toast.error('Bulk action failed'),
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => contactApi.create(data),
    onSuccess: (newContact) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', tenantId] });
      setShowCreateForm(false);
      setSelectedId(newContact.id);
      toast.success('Contact created');
    },
    onError: () => toast.error('Failed to create contact'),
  });

  async function handleExport() {
    if (!tenantId) return;
    try {
      const blob = await contactApi.export(tenantId);
      downloadBlob(blob, 'contacts.csv');
    } catch {
      toast.error('Export failed');
    }
  }

  // Get all unique tags from loaded contacts
  const allTags = [...new Set(contacts.flatMap((c) => c.tags))];

  return (
    <div>
      <Header
        title="Contacts"
        description={`${total} contacts in your CRM`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Contact
            </Button>
          </div>
        }
      />

      <div className="flex gap-6">
        {/* Left: List */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <Input
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-64"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <select
              value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-800">{selectedIds.size} selected</span>
              <div className="flex gap-2 ml-auto">
                <div className="flex gap-1.5">
                  <Input
                    value={bulkTag}
                    onChange={(e) => setBulkTag(e.target.value)}
                    placeholder="Tag name"
                    className="h-8 w-32 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => { if (bulkTag.trim()) bulkMutation.mutate({ action: 'tag', value: bulkTag.trim() }); }}
                    disabled={!bulkTag.trim() || bulkMutation.isPending}
                  >
                    <Tag className="h-3 w-3 mr-1" /> Tag
                  </Button>
                </div>
                <select
                  value={bulkStatus}
                  onChange={(e) => {
                    if (e.target.value) {
                      setBulkStatus(e.target.value);
                      bulkMutation.mutate({ action: 'status', value: e.target.value });
                    }
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  disabled={bulkMutation.isPending}
                >
                  <option value="">Set Status...</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (confirm(`Delete ${selectedIds.size} contacts? This cannot be undone.`)) {
                      bulkMutation.mutate({ action: 'delete' });
                    }
                  }}
                  disabled={bulkMutation.isPending}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <Card>
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground">Loading contacts...</div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-3" />
                <p className="text-muted-foreground">No contacts found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === contacts.length && contacts.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Tags</th>
                      <th className="px-4 py-3 font-medium text-right">Spent</th>
                      <th className="px-4 py-3 font-medium">Last Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => {
                      const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.LEAD;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                          className={cn(
                            'border-b last:border-0 cursor-pointer text-sm transition-colors',
                            c.id === selectedId ? 'bg-blue-50' : selectedIds.has(c.id) ? 'bg-blue-50/50' : 'hover:bg-muted/50'
                          )}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(c.id)}
                              onChange={() => toggleSelect(c.id)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{c.name || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground font-mono">{maskPhone(c.phone)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', statusCfg.color)}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {c.tags.slice(0, 2).map((t) => (
                                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                              ))}
                              {c.tags.length > 2 && <Badge variant="outline" className="text-xs">+{c.tags.length - 2}</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {formatCurrency(c.totalSpent)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {c.lastContactAt ? formatRelativeTime(c.lastContactAt) : 'Never'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t text-sm text-muted-foreground">
                <span>Page {page} of {totalPages} ({total} total)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Detail panel */}
        {selectedContact && (
          <ContactDetailPanel
            contact={selectedContact}
            onSave={(updates) => saveMutation.mutate({ id: selectedContact.id, ...updates })}
            onDelete={() => {
              if (confirm(`Delete ${selectedContact.name || selectedContact.phone}? This cannot be undone.`)) {
                deleteMutation.mutate(selectedContact.id);
              }
            }}
            onSendSms={() => setShowSmsModal(true)}
            isSaving={saveMutation.isPending}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreateForm && (
        <CreateContactModal
          tenantId={tenantId!}
          onClose={() => setShowCreateForm(false)}
          onCreate={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}

      {/* SMS modal */}
      {showSmsModal && selectedContact && (
        <SendSmsModal
          contact={selectedContact}
          onClose={() => setShowSmsModal(false)}
          onSend={(message) => sendSmsMutation.mutate({ id: selectedContact.id, message })}
          isSending={sendSmsMutation.isPending}
        />
      )}
    </div>
  );
}

// ── ContactDetailPanel ────────────────────────────────────────────────────────

function ContactDetailPanel({ contact, onSave, onDelete, onSendSms, isSaving }: {
  contact: Contact;
  onSave: (updates: Partial<Contact>) => void;
  onDelete: () => void;
  onSendSms: () => void;
  isSaving: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'activity'>('details');
  const [name, setName] = useState(contact.name ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [status, setStatus] = useState<ContactStatus>(contact.status);
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setName(contact.name ?? '');
    setEmail(contact.email ?? '');
    setStatus(contact.status);
    setTags(contact.tags);
  }, [contact.id, contact.name, contact.email, contact.status, contact.tags]);

  const tabClass = (t: string) => cn(
    'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
    activeTab === t
      ? 'border-primary text-primary'
      : 'border-transparent text-muted-foreground hover:text-foreground'
  );

  return (
    <div className="w-80 shrink-0">
      <Card className="sticky top-4">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">{contact.name || 'Unknown Contact'}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{maskPhone(contact.phone)}</p>
            </div>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', STATUS_CONFIG[contact.status].color)}>
              {STATUS_CONFIG[contact.status].label}
            </span>
          </div>
          {/* Tabs */}
          <div className="flex mt-3 border-b -mx-6 px-2">
            {(['details', 'notes', 'activity'] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)} className={tabClass(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          {activeTab === 'details' && (
            <DetailsTab
              name={name} setName={setName}
              email={email} setEmail={setEmail}
              status={status} setStatus={setStatus}
              tags={tags} setTags={setTags}
              newTag={newTag} setNewTag={setNewTag}
              contact={contact}
              onSave={() => onSave({ name: name || null, email: email || null, status, tags })}
              onDelete={onDelete}
              onSendSms={onSendSms}
              isSaving={isSaving}
            />
          )}
          {activeTab === 'notes' && <NotesTab contactId={contact.id} tenantId={contact.tenantId} />}
          {activeTab === 'activity' && <ActivityTab contactId={contact.id} />}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Details Tab ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DetailsTab({ name, setName, email, setEmail, status, setStatus, tags, setTags, newTag, setNewTag, contact, onSave, onDelete, onSendSms, isSaving }: any) {
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold">{contact.totalOrders}</div>
          <div className="text-xs text-muted-foreground">Orders</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold">{formatCurrency(contact.totalSpent)}</div>
          <div className="text-xs text-muted-foreground">Spent</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold">{contact.conversationCount ?? 0}</div>
          <div className="text-xs text-muted-foreground">Convos</div>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Full name" />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <Input type="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="email@example.com" />
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <select
          value={status}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as ContactStatus)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{(cfg as { label: string }).label}</option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <Label className="text-xs">Tags</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((t: string) => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs">
              {t}
              <button onClick={() => setTags(tags.filter((x: string) => x !== t))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTag(e.target.value)}
            placeholder="Add tag"
            className="h-8 text-xs"
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && newTag.trim()) {
                setTags([...tags, newTag.trim()]);
                setNewTag('');
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={() => {
              if (newTag.trim()) { setTags([...tags, newTag.trim()]); setNewTag(''); }
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Conversations link */}
      <Link href={`/dashboard/conversations?phone=${contact.phone}`} className="text-xs text-primary hover:underline flex items-center gap-1">
        <MessageSquare className="h-3 w-3" /> View conversations
      </Link>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        <Button size="sm" onClick={onSave} disabled={isSaving} className="flex-1">
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" onClick={onSendSms}>
          <Send className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────

function NotesTab({ contactId, tenantId }: { contactId: string; tenantId: string }) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');

  const { data: notes = [] } = useQuery<ContactNote[]>({
    queryKey: ['contact-notes', contactId],
    queryFn: () => contactApi.getNotes(contactId),
    enabled: !!contactId,
  });

  const addMutation = useMutation({
    mutationFn: (body: string) => contactApi.addNote(contactId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
      setNewNote('');
      toast.success('Note added');
    },
    onError: () => toast.error('Failed to add note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => contactApi.deleteNote(contactId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
    },
    onError: () => toast.error('Failed to delete note'),
  });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          className="w-full"
          onClick={() => { if (newNote.trim()) addMutation.mutate(newNote.trim()); }}
          disabled={!newNote.trim() || addMutation.isPending}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {addMutation.isPending ? 'Adding...' : 'Add Note'}
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground opacity-30 mb-2" />
          <p className="text-xs text-muted-foreground">No notes yet — add one above</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-muted/50 rounded-lg p-3 relative group">
              <p className="text-sm whitespace-pre-wrap pr-6">{note.body}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(note.createdAt)}</p>
              <button
                onClick={() => deleteMutation.mutate(note.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────

function ActivityTab({ contactId }: { contactId: string }) {
  const { data } = useQuery<{ activities: ActivityItem[] }>({
    queryKey: ['contact-activity', contactId],
    queryFn: () => contactApi.getActivity(contactId),
    enabled: !!contactId,
  });

  const activities = data?.activities ?? [];

  if (activities.length === 0) {
    return (
      <div className="text-center py-6">
        <Activity className="h-8 w-8 mx-auto text-muted-foreground opacity-30 mb-2" />
        <p className="text-xs text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  const getIcon = (type: string) => {
    if (type === 'conversation') return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />;
    if (type === 'order') return <ShoppingBag className="h-3.5 w-3.5 text-green-500" />;
    return <Calendar className="h-3.5 w-3.5 text-purple-500" />;
  };

  const getDescription = (item: ActivityItem) => {
    if (item.type === 'conversation') return item.summary;
    if (item.type === 'order') return `Order #${item.orderNumber} — ${formatCurrency(item.total * 100)} (${item.status.toLowerCase()})`;
    return `Meeting ${item.status.toLowerCase()}${item.scheduledAt ? ` on ${new Date(item.scheduledAt).toLocaleDateString()}` : ''}`;
  };

  return (
    <div className="space-y-2">
      {activities.map((item, i) => (
        <div key={`${item.type}-${item.id}-${i}`} className="flex gap-2.5 items-start">
          <div className="mt-0.5 h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
            {getIcon(item.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground line-clamp-2">{getDescription(item)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(item.occurredAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SendSmsModal ──────────────────────────────────────────────────────────────

function SendSmsModal({ contact, onClose, onSend, isSending }: {
  contact: Contact;
  onClose: () => void;
  onSend: (message: string) => void;
  isSending: boolean;
}) {
  const [message, setMessage] = useState('');
  const MAX = 160;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Send SMS</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            To: <span className="font-mono">{maskPhone(contact.phone)}</span>
            {contact.name && ` (${contact.name})`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1600))}
              placeholder="Type your message..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className={cn('text-xs text-right', message.length > MAX ? 'text-orange-500' : 'text-muted-foreground')}>
              {message.length} / {MAX} chars{message.length > MAX && ' (will split into multiple SMS)'}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => onSend(message)}
              disabled={!message.trim() || isSending}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? 'Sending...' : 'Send SMS'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── CreateContactModal ────────────────────────────────────────────────────────

function CreateContactModal({ tenantId, onClose, onCreate, isPending }: {
  tenantId: string;
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<ContactStatus>('LEAD');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Add Contact</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+12175551234" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ContactStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{(cfg as { label: string }).label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onCreate({ tenantId, phone, name: name || undefined, email: email || undefined, status })}
              disabled={!phone.trim() || isPending}
            >
              {isPending ? 'Creating...' : 'Create Contact'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
