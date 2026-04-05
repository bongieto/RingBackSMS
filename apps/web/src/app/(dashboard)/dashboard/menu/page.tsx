'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Pencil, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  isAvailable: boolean;
}

interface MenuItemFormData {
  id?: string;
  name: string;
  description: string;
  price: string;
  category: string;
  isAvailable: boolean;
}

const defaultForm: MenuItemFormData = {
  name: '',
  description: '',
  price: '',
  category: '',
  isAvailable: true,
};

export default function MenuPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MenuItemFormData>(defaultForm);

  const { data: menuItems = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId!),
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => tenantApi.deleteMenuItem(tenantId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Item deleted!');
    },
    onError: () => toast.error('Failed to delete item'),
  });

  const handleDelete = (item: MenuItem) => {
    if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (data: MenuItemFormData) =>
      tenantApi.upsertMenuItem(tenantId!, {
        ...data,
        price: parseFloat(data.price),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      setShowForm(false);
      setForm(defaultForm);
      toast.success(form.id ? 'Item updated!' : 'Item added!');
    },
    onError: () => toast.error('Failed to save item'),
  });

  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category ?? 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div>
      <Header
        title="Menu"
        description="Manage items customers can order via SMS"
        action={
          <Button onClick={() => { setForm(defaultForm); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        }
      />

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">{form.id ? 'Edit Item' : 'New Menu Item'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Lumpia Shanghai" />
              </div>
              <div className="space-y-1.5">
                <Label>Price *</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="8.99" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Appetizers" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Crispy Filipino spring rolls..." />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.isAvailable} onCheckedChange={v => setForm(f => ({ ...f, isAvailable: v }))} />
                <Label>Available</Label>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || !form.price || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Item'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Menu Items */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading menu...</div>
      ) : menuItems.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UtensilsCrossed className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No menu items yet</p>
            <Button className="mt-4" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Your First Item
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
                        {!item.isAvailable && <Badge variant="secondary">Unavailable</Badge>}
                      </div>
                      {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold">${Number(item.price).toFixed(2)}</span>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setForm({ id: item.id, name: item.name, description: item.description ?? '', price: String(item.price), category: item.category ?? '', isAvailable: item.isAvailable });
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
