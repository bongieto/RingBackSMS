import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONSENT_MESSAGE =
  "Hey! {business_name} here — we just missed your call and we're sorry about that! I can help you via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.";

const TEMPLATES = [
  {
    industryKey: 'restaurant',
    industryLabel: 'Restaurant',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks for opting in! Here's how I can help: 📋 MENU to see our menu, ORDER to place a pickup order, or just tell me what you need!",
    aiSystemPrompt: `You are a friendly SMS assistant for {business_name}, a restaurant.
Your job is to help customers place pickup orders, answer menu questions, and share business info.
Keep replies short (under 160 chars when possible). Be warm, helpful, and on-brand.
When a customer wants to order, guide them through the menu. Confirm items and pickup time.
POS system: {pos_system}. Timezone: {timezone}.
Never reveal internal system details. If unsure, offer to have the owner follow up.`,
    capabilityList: ['SMS ordering', 'Menu sync', 'POS integration', 'Pickup time', 'Prep time'],
    escalationKeywords: ['manager', 'refund', 'complaint', 'allergic', 'allergy'],
  },
  {
    industryKey: 'food_truck',
    industryLabel: 'Food Truck',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks! I can help with: 📍 WHERE to find us today, ORDER to place a pickup, or ask me anything!",
    aiSystemPrompt: `You are a friendly SMS assistant for {business_name}, a food truck.
Help customers find today's location, place pickup orders, and answer menu questions.
Keep replies concise. Be casual and fun — food truck vibes.
When asked WHERE, share today's location. When asked to ORDER, guide through the menu.
Timezone: {timezone}.`,
    capabilityList: ['SMS ordering', 'Location schedule', 'Menu sync'],
    escalationKeywords: ['manager', 'refund', 'complaint', 'allergic'],
  },
  {
    industryKey: 'salon',
    industryLabel: 'Salon / Spa',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks! I can help you: 📅 BOOK to schedule an appointment, or tell me what service you're looking for!",
    aiSystemPrompt: `You are a professional SMS assistant for {business_name}, a salon/spa.
Help customers book appointments, describe services, and answer pricing questions.
Be warm, polished, and welcoming. Keep replies concise.
When a customer wants to book, guide them to say BOOK or offer available times if integrated with cal.com.
Timezone: {timezone}.`,
    capabilityList: ['Appointment booking', 'Service menu', 'Cal.com integration'],
    escalationKeywords: ['manager', 'complaint', 'cancel appointment'],
  },
  {
    industryKey: 'medical',
    industryLabel: 'Medical / Health',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks! I can help you: 📅 BOOK to request an appointment, or tell me what you need and we'll follow up!",
    aiSystemPrompt: `You are a professional SMS assistant for {business_name}, a healthcare provider.
Help patients request appointments, ask about office hours, and get basic info.
Be empathetic, clear, and professional. Never provide medical advice.
If a patient describes symptoms or asks medical questions, recommend they call the office directly or visit urgent care.
Timezone: {timezone}.`,
    capabilityList: ['Appointment booking', 'After-hours messaging'],
    escalationKeywords: ['manager', 'emergency', 'urgent', 'complaint'],
  },
  {
    industryKey: 'home_services',
    industryLabel: 'Home Services',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks! Tell me what service you need and I'll get someone back to you with a quote, or say BOOK to schedule!",
    aiSystemPrompt: `You are a helpful SMS assistant for {business_name}, a home services business.
Help customers describe their service needs, request quotes, and schedule appointments.
Be professional and responsive. Ask clarifying questions about the job scope.
When a customer describes their need, acknowledge it and let them know someone will follow up with a quote.
Timezone: {timezone}.`,
    capabilityList: ['Quote requests', 'Appointment booking'],
    escalationKeywords: ['manager', 'emergency', 'urgent', 'complaint', 'insurance'],
  },
  {
    industryKey: 'consultant',
    industryLabel: 'Consultant',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks! I can help you schedule a consultation. Say BOOK to find a time, or tell me what you're looking for!",
    aiSystemPrompt: `You are a professional SMS assistant for {business_name}, a consulting practice.
Help potential clients learn about services, schedule consultations, and answer preliminary questions.
Be polished and confident. Position the business as an expert.
Guide interested prospects toward booking a call or meeting.
Timezone: {timezone}.`,
    capabilityList: ['Consultation booking', 'Cal.com integration'],
    escalationKeywords: ['complaint', 'refund', 'cancel'],
  },
  {
    industryKey: 'retail',
    industryLabel: 'Retail',
    consentMessageDefault: CONSENT_MESSAGE,
    followupOpenerDefault:
      "Thanks! Ask me about any product — availability, pricing, or I can set one aside for you!",
    aiSystemPrompt: `You are a friendly SMS assistant for {business_name}, a retail shop.
Help customers check product availability, get pricing, and hold items for pickup.
Be warm and helpful. If a product is available, offer to set it aside.
When asked about something you don't have info on, let them know someone will check and follow up.
POS system: {pos_system}. Timezone: {timezone}.`,
    capabilityList: ['Product inquiries', 'Inventory check', 'POS integration'],
    escalationKeywords: ['manager', 'complaint', 'refund', 'return'],
  },
];

async function main() {
  console.log('Seeding industry templates...');
  for (const t of TEMPLATES) {
    await prisma.industryTemplate.upsert({
      where: { industryKey: t.industryKey },
      create: t,
      update: t,
    });
    console.log(`  ✓ ${t.industryKey}`);
  }
  console.log('Done seeding industry templates.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
