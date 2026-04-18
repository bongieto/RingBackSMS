'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/tabs';
import { MenusTab } from './_components/MenusTab';
import { CategoriesTab } from './_components/CategoriesTab';
import { ItemsTab } from './_components/ItemsTab';
import { OptionGroupsTab } from './_components/OptionGroupsTab';
import { OptionsTab } from './_components/OptionsTab';

type Tab = 'menus' | 'categories' | 'items' | 'option-groups' | 'options';

export default function MenuPage() {
  const { tenantId } = useTenantId();
  const [active, setActive] = useState<Tab>('items');

  if (!tenantId) {
    return (
      <div>
        <Header title="Menu" description="Set up your menu for online and SMS ordering." />
        <div className="text-sm text-muted-foreground">Loading tenant…</div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Menu" description="Set up your menu for online and SMS ordering." />
      <Tabs value={active} onChange={(v) => setActive(v as Tab)}>
        <TabList>
          <TabTrigger value="menus">Menus</TabTrigger>
          <TabTrigger value="categories">Categories</TabTrigger>
          <TabTrigger value="items">Items</TabTrigger>
          <TabTrigger value="option-groups">Option groups</TabTrigger>
          <TabTrigger value="options">Options</TabTrigger>
        </TabList>

        <TabPanel value="menus">
          <MenusTab tenantId={tenantId} />
        </TabPanel>
        <TabPanel value="categories">
          <CategoriesTab tenantId={tenantId} />
        </TabPanel>
        <TabPanel value="items">
          <ItemsTab tenantId={tenantId} />
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
