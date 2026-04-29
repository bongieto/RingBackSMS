'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/tabs';
import { getProfile, type MenuTab } from '@/lib/businessTypeProfile';

const tabLoading = () => <div className="py-8 text-sm text-muted-foreground">Loading…</div>;
const MenusTab = dynamic(() => import('./_components/MenusTab').then((mod) => mod.MenusTab), {
  ssr: false,
  loading: tabLoading,
});
const CategoriesTab = dynamic(() => import('./_components/CategoriesTab').then((mod) => mod.CategoriesTab), {
  ssr: false,
  loading: tabLoading,
});
const ItemsTab = dynamic(() => import('./_components/ItemsTab').then((mod) => mod.ItemsTab), {
  ssr: false,
  loading: tabLoading,
});
const OptionGroupsTab = dynamic(() => import('./_components/OptionGroupsTab').then((mod) => mod.OptionGroupsTab), {
  ssr: false,
  loading: tabLoading,
});
const OptionsTab = dynamic(() => import('./_components/OptionsTab').then((mod) => mod.OptionsTab), {
  ssr: false,
  loading: tabLoading,
});
const ImportTab = dynamic(() => import('./_components/ImportTab').then((mod) => mod.ImportTab), {
  ssr: false,
  loading: tabLoading,
});

export default function MenuPage() {
  const { tenantId, businessType } = useTenantId();
  const profile = getProfile(businessType);
  const { pageTitle, pageDescription, itemNoun, visibleTabs, tabLabels = {} } = profile.menu;

  const searchParams = useSearchParams();
  const paramTab = searchParams.get('tab') as MenuTab | null;
  const defaultTab = paramTab && visibleTabs.includes(paramTab) ? paramTab : visibleTabs[0];
  const [active, setActive] = useState<MenuTab>(defaultTab);

  if (!tenantId) {
    return (
      <div>
        <Header title={pageTitle} description={pageDescription} />
        <div className="text-sm text-muted-foreground">Loading tenant…</div>
      </div>
    );
  }

  const tabLabel = (tab: MenuTab, fallback: string) => tabLabels[tab] ?? fallback;

  return (
    <div>
      <Header title={pageTitle} description={pageDescription} />
      <Tabs value={active} onChange={(v) => setActive(v as MenuTab)}>
        <TabList>
          {visibleTabs.includes('menus') && (
            <TabTrigger value="menus">{tabLabel('menus', 'Menus')}</TabTrigger>
          )}
          {visibleTabs.includes('categories') && (
            <TabTrigger value="categories">{tabLabel('categories', 'Categories')}</TabTrigger>
          )}
          {visibleTabs.includes('items') && (
            <TabTrigger value="items">{tabLabel('items', 'Items')}</TabTrigger>
          )}
          {visibleTabs.includes('import') && (
            <TabTrigger value="import">{tabLabel('import', 'Import')}</TabTrigger>
          )}
          {visibleTabs.includes('option-groups') && (
            <TabTrigger value="option-groups">{tabLabel('option-groups', 'Option groups')}</TabTrigger>
          )}
          {visibleTabs.includes('options') && (
            <TabTrigger value="options">{tabLabel('options', 'Options')}</TabTrigger>
          )}
        </TabList>

        <TabPanel value="menus">
          <MenusTab tenantId={tenantId} />
        </TabPanel>
        <TabPanel value="categories">
          <CategoriesTab tenantId={tenantId} />
        </TabPanel>
        <TabPanel value="items">
          <ItemsTab tenantId={tenantId} noun={itemNoun} />
        </TabPanel>
        <TabPanel value="import">
          <ImportTab tenantId={tenantId} />
        </TabPanel>
        <TabPanel value="option-groups">
          <OptionGroupsTab tenantId={tenantId} />
        </TabPanel>
        <TabPanel value="options">
          <OptionsTab tenantId={tenantId} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
