'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Pencil, Trash2, UtensilsCrossed, ChevronDown, ChevronRight, ListFilter } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import { getProfile } from '@/lib/businessTypeProfile';

interface Modifier {
  id: string;
  name: string;
  priceAdjust: number;
  isDefault: boolean;
  sortOrder: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  selectionType: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  modifiers: Modifier[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  isAvailable: boolean;
  requiresBooking?: boolean;
  modifierGroups?: ModifierGroup[];
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
  const { data: tenant } = useQuery<{ businessType?: string }>({
    queryKey: ['tenant-me'],
    queryFn: () => tenantApi.getMe(),
  });
  const profile = getProfile(tenant?.businessType);
  const nounLabel = profile.catalogNoun === 'products' ? 'Products' : 'Menu';
  const nounSingular = profile.catalogNoun === 'products' ? 'product' : 'item';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MenuItemFormData>(defaultForm);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data: allItems = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId!),
    enabled: !!tenantId,
  });

  // Only show menu items (exclude services)
  const menuItems = allItems.filter((item) => !item.requiresBooking);

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

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category ?? 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div>
      <Header
        title={nounLabel}
        description={`Manage ${nounSingular}s customers can ${profile.catalogNoun === 'products' ? 'inquire about and reserve' : 'order'} via SMS`}
        action={
          <Button onClick={() => { setForm(defaultForm); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add {nounSingular}
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
              {items.map(item => {
                const hasModifiers = (item.modifierGroups ?? []).length > 0;
                const isExpanded = expandedItems.has(item.id);

                return (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {hasModifiers && (
                            <button
                              onClick={() => toggleExpanded(item.id)}
                              className="p-0.5 hover:bg-muted rounded transition-colors flex-shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{item.name}</span>
                              {!item.isAvailable && <Badge variant="secondary">Unavailable</Badge>}
                              {hasModifiers && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <ListFilter className="h-3 w-3" />
                                  {item.modifierGroups!.length} option{item.modifierGroups!.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
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
                      </div>

                      {/* Modifier Groups (expanded) */}
                      {hasModifiers && isExpanded && (
                        <div className="mt-3 ml-6 border-l-2 border-muted pl-4 space-y-3">
                          {item.modifierGroups!.map((group) => (
                            <div key={group.id}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-sm font-medium">{group.name}</span>
                                <Badge variant={group.required ? 'default' : 'secondary'} className="text-xs">
                                  {group.required ? 'Required' : 'Optional'}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {group.selectionType === 'MULTIPLE' ? 'Multi-select' : 'Single'}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.modifiers.map((mod) => (
                                  <span
                                    key={mod.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-xs"
                                  >
                                    {mod.name}
                                    {mod.priceAdjust > 0 && (
                                      <span className="text-emerald-600 font-medium">+${Number(mod.priceAdjust).toFixed(2)}</span>
                                    )}
                                    {mod.isDefault && (
                                      <span className="text-blue-500 font-medium">(default)</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground italic">
                            Options synced from POS. Edit in your POS system to update.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
