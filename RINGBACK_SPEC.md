# RingBack SaaS Platform — Full Specification

Build "RingBack" — a multi-tenant SaaS platform that enables any business to automatically respond to missed calls via intelligent SMS conversations. Each tenant gets their own branded missed-call response system with custom flows for ordering, scheduling, or general inquiries.

The first tenant pre-configured is The Lumpia House & Truck (a Filipino restaurant in Springfield, Illinois). The platform must support any business type: restaurants, service businesses, consultants, medical offices, etc.

## TECH STACK
- Runtime: Node.js 20+ with TypeScript
- Framework: Express.js (API) + Next.js 14 App Router (frontend)
- Auth: Clerk (multi-tenant, org-based)
- SMS/Voice: Twilio (shared platform account with sub-accounts per tenant)
- AI: Anthropic Claude API (claude-sonnet-4-20250514)
- State: Redis (ioredis) — per-tenant namespaced keys
- Database: Supabase (Postgres) with Row Level Security (RLS)
- Billing: Stripe (subscriptions + usage-based metering)
- POS: Square API (catalog sync, order creation, payment processing)
- Email: Resend
- File storage: Supabase Storage
- Deployment: Railway (API) + Vercel (Next.js)
- Monorepo: Turborepo, pnpm
- Validation: zod, ORM: Prisma
- Testing: Jest + supertest, Playwright
- Logging: Winston + Axiom

This file has been saved. The full detailed spec with database schema, services, routes, etc. will be provided in the build task prompt.
