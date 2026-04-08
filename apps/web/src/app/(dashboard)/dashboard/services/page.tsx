'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Briefcase, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';

interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  isAvailable: boolean;
  duration: number | null;
  requiresBooking: boolean;
}

interface ServiceFormData {
  id?: string;
  name: string;
  description: string;
  price: string;
  category: string;
  duration: string;
  isAvailable: boolean;
}

const defaultForm: ServiceFormData = {
  name: '',
  description: '',
  price: '',
  category: '',
  duration: '',
  isAvailable: true,
};

export default function ServicesPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ServiceFormData>(defaultForm);

  const { data: allItems = [], isLoading } = useQuery<ServiceItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId!),
    enabled: !!tenantId,
  });

  // Only show items flagged as services (requiresBooking)
  const services = allItems.filter((item) => item.requiresBooking);

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => tenantApi.deleteMenuItem(tenantId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Service deleted!');
    },
    onError: () => toast.error('Failed to delete service'),
  });

  const handleDelete = (item: ServiceItem) => {
    if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (data: ServiceFormData) =>
      tenantApi.upsertMenuItem(tenantId!, {
        ...data,
        price: parseFloat(data.price),
        duration: data.duration ? parseInt(data.duration, 10) : null,
        requiresBooking: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      setShowForm(false);
      setForm(defaultForm);
      toast.success(form.id ? 'Service updated!' : 'Service added!');
    },
    onError: () => toast.error('Failed to save service'),
  });

  const grouped = services.reduce<Record<string, ServiceItem[]>>((acc, item) => {
    const cat = item.category ?? 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div>
      <Header
        title="Services"
        description="Manage services your business offers — the AI will reference these when chatting with callers"
        action={
          <Button onClick={() => { setForm(defaultForm); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Service
          </Button>
        }
      />

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">{form.id ? 'Edit Service' : 'New Service'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Service Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Men's Haircut" />
              </div>
              <div className="space-y-1.5">
                <Label>Price *</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="25.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (minutes)</Label>
                <Input type="number" min="1" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="30" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Hair Services" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Includes wash, cut, and style" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.isAvailable} onCheckedChange={v => setForm(f => ({ ...f, isAvailable: v }))} />
                <Label>Available</Label>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || !form.price || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Service'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Items */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading services...</div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No services yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add services so the AI can tell callers what you offer and help them book appointments.</p>
            <Button className="mt-4" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Your First Service
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h3>
            <div className="space-y-2">
              {items.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.duration && (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" />
                            {item.duration} min
                          </Badge>
                        )}
                        {!item.isAvailable && <Badge variant="secondary">Unavailable</Badge>}
                      </div>
                      {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold">${Number(item.price).toFixed(2)}</span>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setForm({ id: item.id, name: item.name, description: item.description ?? '', price: String(item.price), category: item.category ?? '', duration: item.duration ? String(item.duration) : '', isAvailable: item.isAvailable });
                        setShowForm(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item)} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
