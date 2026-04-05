# RingBack

**AI-Powered SMS Auto-Response for Missed Calls**

RingBack automatically responds to missed calls via AI-powered SMS, helping businesses capture customers they would otherwise lose. Built as a multi-tenant SaaS platform.

---

## Architecture Overview

```
ringback/
├── apps/
│   ├── api/          # Express.js REST API (Node.js 20+, TypeScript)
│   └── web/          # Next.js 14 dashboard (Phase 2)
├── packages/
│   ├── shared-types/ # Zod schemas + TypeScript interfaces
│   └── flow-engine/  # Portable SMS state machine
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### How It Works

1. A customer calls a RingBack tenant's phone number
2. If the call is missed, Twilio fires a `call-status` webhook to the API
3. The API sends the tenant's configured greeting SMS to the caller
4. The caller replies → Twilio fires an `sms-reply` webhook
5. The **Flow Engine** processes the message and routes to the right flow:
   - **ORDER flow** — menu display → item selection → confirmation → pickup time
   - **MEETING flow** — scheduling request → cal.com booking link or owner notification
   - **FALLBACK flow** — Claude AI conversational assistant
6. Side effects are executed (save order to DB, create Square order, notify owner via email/SMS/Slack)
7. A reply SMS is sent back to the caller

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript 5 |
| API Framework | Express.js 4 |
| Monorepo | Turborepo + pnpm workspaces |
| Database | Supabase PostgreSQL via Prisma ORM |
| Cache / State | Redis (ioredis) |
| SMS / Voice | Twilio (sub-accounts per tenant) |
| AI | Anthropic Claude (Haiku for speed) |
| Payments | Stripe (subscriptions + metered billing) |
| POS Integration | Square (catalog + orders) |
| Authentication | Clerk (org-based multi-tenancy) |
| Email | Resend |
| Logging | Winston + Axiom |
| Scheduling | cal.com API |

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL (or Supabase account)
- Redis
- Accounts for: Twilio, Anthropic, Clerk, Stripe, Square, Resend

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` with your credentials. See the [Environment Variables](#environment-variables) section below.

### 3. Set up the database

```bash
# Generate Prisma client
pnpm --filter=api db:generate

# Push schema to database
pnpm --filter=api db:push

# Run RLS policies (one-time setup on Supabase)
# Copy prisma/rls.sql content and run in Supabase SQL editor

# Seed with demo data (The Lumpia House & Truck)
pnpm --filter=api db:seed
```

### 4. Start development servers

```bash
# Start all services
pnpm dev

# Or start individually
pnpm --filter=api dev     # API on :3001
pnpm --filter=web dev     # Web on :3000
```

### 5. Run tests

```bash
pnpm test

# With coverage
pnpm --filter=api test -- --coverage
pnpm --filter=flow-engine test -- --coverage
```

---

## Environment Variables

All variables are required unless marked optional.

### Database
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

### Twilio
| Variable | Description |
|----------|-------------|
| `TWILIO_MASTER_ACCOUNT_SID` | Master account SID for provisioning sub-accounts |
| `TWILIO_MASTER_AUTH_TOKEN` | Master account auth token |

### Anthropic
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude (intent detection + AI replies) |

### Clerk
| Variable | Description |
|----------|-------------|
| `CLERK_SECRET_KEY` | Server-side Clerk secret key |
| `CLERK_PUBLISHABLE_KEY` | Client-side Clerk publishable key |

### Stripe
| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `STRIPE_STARTER_PRICE_ID` | Price ID for STARTER plan |
| `STRIPE_GROWTH_PRICE_ID` | Price ID for GROWTH plan |
| `STRIPE_SCALE_PRICE_ID` | Price ID for SCALE plan |
| `STRIPE_ENTERPRISE_PRICE_ID` | Price ID for ENTERPRISE plan |
| `STRIPE_SMS_METERED_PRICE_ID` | (Optional) Metered price ID for SMS overage |

### Square
| Variable | Description |
|----------|-------------|
| `SQUARE_APPLICATION_ID` | Square app client ID |
| `SQUARE_APPLICATION_SECRET` | Square app client secret |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square webhook HMAC key |

### Email
| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | From address (e.g. `noreply@ringback.app`) |

### Logging
| Variable | Description |
|----------|-------------|
| `AXIOM_DATASET` | (Optional) Axiom dataset name |
| `AXIOM_TOKEN` | (Optional) Axiom ingest token |

### App
| Variable | Description |
|----------|-------------|
| `PORT` | API port (default: `3001`) |
| `BASE_URL` | Public API base URL (used for Twilio webhook URLs) |
| `NODE_ENV` | `development`, `production`, or `test` |
| `ENCRYPTION_KEY` | 32-byte hex string (64 chars) for AES-256-GCM encryption of tokens |

---

## Plans

| Plan | SMS/mo | AI Calls/mo | Square | Price |
|------|--------|-------------|--------|-------|
| STARTER | 200 | 100 | No | — |
| GROWTH | 1,000 | 500 | Yes | — |
| SCALE | 5,000 | 2,500 | Yes | — |
| ENTERPRISE | Unlimited | Unlimited | Yes | — |

---

## API Endpoints

### Webhooks (no auth — Twilio signature validated)
- `POST /webhooks/twilio/call-status` — Missed call handler, sends greeting SMS
- `POST /webhooks/twilio/sms-reply` — Inbound SMS, runs flow engine
- `POST /webhooks/stripe` — Subscription lifecycle events
- `POST /webhooks/square` — Catalog/order update events

### Tenants (Clerk auth required)
- `GET /tenants/me` — Get tenant by Clerk org
- `POST /tenants` — Create tenant
- `GET /tenants/:id` — Get tenant details
- `PATCH /tenants/:id/config` — Update tenant config
- `GET /tenants/:id/menu` — List menu items
- `POST /tenants/:id/menu` — Create/update menu item
- `GET /tenants/:id/flows` — List flows
- `PATCH /tenants/:id/flows/:flowId` — Enable/disable flow

### Other routes
- `GET /conversations` — List conversations
- `GET /analytics/:tenantId` — Analytics dashboard data
- `POST /billing/checkout` — Create Stripe checkout session
- `POST /billing/portal` — Create Stripe billing portal session
- `GET /integrations/square/connect` — Get Square OAuth URL
- `GET /integrations/square/callback` — OAuth redirect handler
- `POST /integrations/square/sync-catalog` — Pull from Square
- `POST /integrations/square/push-catalog` — Push to Square
- `GET /admin/tenants` — Admin tenant list
- `GET /health` — Health check

---

## Security

- **Token encryption**: All Twilio and Square tokens are encrypted at rest with AES-256-GCM before storing in PostgreSQL
- **Twilio signature validation**: Every incoming webhook is validated using the per-tenant auth token
- **Row Level Security**: PostgreSQL RLS policies enforce tenant isolation at the database layer
- **Rate limiting**: Redis-backed rate limiter prevents SMS flood (20 SMS/phone/hour per tenant)
- **Deduplication**: Twilio MessageSid dedup prevents double-processing

---

## Deployment

### Railway (API)

The `railway.toml` in `apps/api` configures Nixpacks deployment:

```bash
railway up
```

### Vercel (Web — Phase 2)

```bash
vercel --prod
```

---

## Demo Tenant

The seed script creates **The Lumpia House & Truck** as the first tenant:
- Business type: RESTAURANT
- Plan: GROWTH
- Hours: Wed–Sun 11am–8pm (America/Chicago)
- Flows: ORDER, MEETING, FALLBACK all enabled
- 8 Filipino cuisine menu items (placeholder — owner customizes via dashboard)

---

## Development Notes

- The `flow-engine` package has no Express dependency — it's pure logic, fully testable in isolation
- All stored secrets use `ENCRYPTION_KEY` for AES-256-GCM — never store plaintext tokens
- Redis keys are namespaced by `tenantId` to ensure isolation
- Phone numbers in logs are automatically masked (last 4 digits visible only)
