import { PrismaClient, BusinessType, Plan, FlowType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create The Lumpia House & Truck
  const tenant = await prisma.tenant.upsert({
    where: { id: '10000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'The Lumpia House & Truck',
      businessType: BusinessType.RESTAURANT,
      plan: Plan.PRO,
      isActive: true,
    },
  });

  console.log(`Tenant created: ${tenant.name}`);

  // Create TenantConfig
  await prisma.tenantConfig.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      greeting:
        "Hi! Sorry we missed your call at The Lumpia House. Reply ORDER to place a food order, MEETING to schedule a call with our owner, or just tell us what you need!",
      timezone: 'America/Chicago',
      businessHoursStart: '11:00',
      businessHoursEnd: '20:00',
      businessDays: [3, 4, 5, 6, 0], // Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
      aiPersonality: 'warm, friendly, and proud of Filipino cuisine',
      ownerEmail: 'owner@thelumpiahouse.com',
    },
  });

  // Create Flows
  const flows = [
    { type: FlowType.ORDER, isEnabled: true },
    { type: FlowType.MEETING, isEnabled: true },
    { type: FlowType.FALLBACK, isEnabled: true },
  ];

  for (const flow of flows) {
    await prisma.flow.upsert({
      where: { tenantId_type: { tenantId: tenant.id, type: flow.type } },
      update: { isEnabled: flow.isEnabled },
      create: {
        tenantId: tenant.id,
        type: flow.type,
        isEnabled: flow.isEnabled,
      },
    });
  }

  // Create placeholder menu items (owner will customize)
  const menuItems = [
    { name: 'Lumpia Shanghai (12 pcs)', description: 'Crispy Filipino spring rolls filled with seasoned ground pork', price: 8.99, category: 'Appetizers' },
    { name: 'Lumpia Sariwa', description: 'Fresh spring rolls with vegetables and shrimp', price: 9.99, category: 'Appetizers' },
    { name: 'Pancit Bihon', description: 'Stir-fried rice noodles with vegetables and your choice of protein', price: 11.99, category: 'Mains' },
    { name: 'Pancit Canton', description: 'Egg noodles stir-fried with vegetables and pork', price: 12.99, category: 'Mains' },
    { name: 'Adobo Rice Bowl', description: 'Classic Filipino adobo over steamed jasmine rice', price: 13.99, category: 'Mains' },
    { name: 'Sinigang Bowl', description: 'Sour tamarind soup with vegetables and pork', price: 14.99, category: 'Mains' },
    { name: 'Ube Leche Flan', description: 'Purple yam and egg custard dessert', price: 5.99, category: 'Desserts' },
    { name: 'Halo-Halo', description: 'Mixed Filipino dessert with shaved ice, sweet beans, and ube ice cream', price: 7.99, category: 'Desserts' },
  ];

  for (const item of menuItems) {
    const existing = await prisma.menuItem.findFirst({
      where: { tenantId: tenant.id, name: item.name },
    });

    if (!existing) {
      await prisma.menuItem.create({
        data: {
          tenantId: tenant.id,
          ...item,
          isAvailable: true,
        },
      });
    }
  }

  console.log(`Created ${menuItems.length} menu items`);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
