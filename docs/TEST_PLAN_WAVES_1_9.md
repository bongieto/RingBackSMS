# Test plan — Waves 1 through 9

All features land across 9 commits (`9cba6c2` through `0af3c07`). Run
through this in order on a food tenant like **The Lumpia House**
(ordering flow already active). Where a step is destructive on
production data, use a throwaway test tenant or test customer phone.

Legend: ✅ expected behavior · ⚠ known gap / limitation · 🧪 stretch /
optional

---

## Pre-flight

- [ ] Pull + deploy the latest `main` to your staging or prod Vercel
  project so all migrations are applied.
- [ ] Confirm Supabase migrations ran:
  `add_order_tip_and_refund`, `add_tenant_member_roles`,
  `add_cloudprnt_and_grace`, `add_campaigns_reviews_loyalty`,
  `add_language_and_recurring`, `add_whitelabel_and_locations`.
- [ ] Open the dashboard as an org admin, and have a second phone
  handy for the "customer" side of tests.

---

## Wave 1 — Quick wins

### 1.1 Menu QR code
- [ ] Dashboard → **Menu → Menus tab**. Scroll below the availability
  toggle.
- [ ] ✅ A "Menu QR code" card renders with a QR and two buttons.
- [ ] Click **Copy link** — toast confirms; paste shows
  `https://<app>/m/<your-slug>`.
- [ ] Click **Download PNG** — a 1024×1024 QR PNG downloads.
- [ ] Scan the QR from your phone — lands on `/m/<slug>`.

### 1.2 Custom AI instructions wired to agent
- [ ] Dashboard → **Settings**, edit *Custom AI instructions* to add a
  distinctive quirk (e.g. *"Always end with 🍌"*).
- [ ] Text the tenant number "What are your specials?"
- [ ] ✅ Reply reflects your instruction (contains the banana emoji).

### 1.3 "86" quick action on KDS
- [ ] Dashboard → **Kitchen**. Click **86 an item** in the header.
- [ ] ✅ Right-side drawer lists all items. Toggle one off.
- [ ] ✅ Button flips to "Bring back"; item shows in greyed section.
- [ ] Text the bot ordering that item — ✅ agent says it's unavailable.
- [ ] Bring it back — ✅ reordering now works.

### 1.4 Browser notifications + chime on new orders
- [ ] Kitchen tab in focus → place a new order via SMS → ✅ chime plays.
- [ ] Switch to a different browser tab → place another order → ✅
  system notification pops up ("New order #X"). Click it → Kitchen tab
  focuses.
- [ ] First load: browser asks for Notification permission (accept).
- [ ] Mute via header toggle → ✅ no chime (notifications still fire).

### 1.5 Customer name capture
- [ ] Text the bot to start an order. When it asks for pickup + name
  → reply "Rolando, 7pm."
- [ ] ✅ Order places. KDS card shows **#123 Rolando**.
- [ ] ✅ Order status SMS greets "Hi Rolando!".
- [ ] ✅ Receipt page (`/r/<id>`) shows "Name: Rolando".
- [ ] If Square is connected: ✅ Square payment note includes the name.
- [ ] Place a second order from the same phone without giving a name —
  ✅ prompt skips the name question (Contact.name already set).

---

## Wave 2 — Repeat-customer loop

### 2.1 REORDER / "my usual"
- [ ] As a customer who has a prior completed order on the same phone,
  text **"REORDER"** (or *"my usual"*, *"same as last time"*).
- [ ] ✅ Bot refills the cart with the last order's items and asks for
  pickup time.
- [ ] If items are no longer on the menu: ✅ bot silently drops them and
  mentions what it could not bring back.
- [ ] From a brand-new phone with no prior order: ✅ bot gently says it
  doesn't have a previous order on file.

### 2.2 Order tracker `/o/<id>`
- [ ] Place a test order that uses Stripe (requirePayment on).
- [ ] After payment → ✅ SMS "Payment received … Track: <url>".
- [ ] Open the tracker link on your phone:
  - [ ] ✅ Progress pills: Confirmed → Preparing → Ready → Picked up.
  - [ ] ✅ Live ETA while PREPARING.
  - [ ] ✅ Auto-refresh every 10s.
- [ ] From KDS, advance the order status → ✅ tracker pill updates
  within 10s without a manual refresh.
- [ ] Tracker URL is not indexable — `curl -I <url>` shows
  `X-Robots-Tag: noindex, nofollow`.

### 2.3 Digital receipt `/r/<id>`
- [ ] After the order is marked **Ready** → ✅ SMS has a receipt link.
- [ ] Open `/r/<id>`:
  - [ ] ✅ Itemized list + subtotal + tax + fee (if any) + total.
  - [ ] ✅ **PAID** badge visible.
  - [ ] Click **Save or print this receipt** → browser print dialog.

---

## Wave 3 — Checkout improvements

### 3.1 Tip jar
- [ ] Run a test order that uses Stripe. ✅ "Pay securely here:" SMS
  now links to `/pay/<id>` (not Stripe directly).
- [ ] Open the link — ✅ see order summary + tip presets
  (15 / 18 / 20 / 25 / No tip / Custom).
- [ ] Pick 20% → total updates → click **Continue to payment** → ✅
  redirected to Stripe Checkout with a "Tip" line item matching the
  selected amount.
- [ ] Complete payment → webhook fires → ✅ `Order.tipAmount` persisted,
  visible on `/r/<id>` between Processing and Total.
- [ ] Open `/pay/<id>` again after payment → ✅ redirects to the receipt
  (doesn't re-offer tipping).

### 3.2 Auto-refund from KDS
- [ ] Place a paid test order ($1.00 so you don't burn real money).
- [ ] On the KDS, click the X → confirm cancel.
- [ ] ✅ Stripe dashboard shows a refund for the full amount within 10s.
- [ ] ✅ Customer SMS: "A refund has been issued for order #X…".
- [ ] `Order.stripeRefundId` + `paymentStatus = 'REFUNDED'` in DB.
- [ ] Click cancel on an unpaid order → ✅ no refund attempted (nothing
  to refund).

---

## Wave 4 — Modifier picker on public menu

- [ ] On the dashboard, add modifier groups to one menu item (e.g.
  Pancit Bihon → "Protein: Shrimp / Chicken", required=true).
- [ ] Open `/m/<slug>` as a customer on a phone.
- [ ] Tap that item → ✅ "Customize" expand reveals the pickers.
- [ ] Pick required option → **Add to order** lights up.
- [ ] Tap "Edit" under the added item → ✅ expands to the current
  selection and lets you change it.
- [ ] Add → tap **Text order** → ✅ prefilled SMS body has the modifier
  in parens: `Order: 1 Pancit Bihon (Shrimp)`.
- [ ] Send the SMS → ✅ agent's `add_items` tool correctly applies the
  modifier (confirm from the KDS ticket).

---

## Wave 5 — Operator analytics

### 5.1 Revenue dashboard
- [ ] Dashboard → **Revenue**.
- [ ] ✅ Header stats: Revenue, Orders, Avg ticket, Tips.
- [ ] ✅ "Revenue by day" line chart shows the last 30 days (zeros on
  empty days).
- [ ] ✅ Top items list sorted by count.
- [ ] ✅ Orders-by-hour histogram — matches your actual peak hours.
- [ ] Switch to 7d / 90d → data reloads without errors.

### 5.2 AI usage dashboard
- [ ] Dashboard → **AI usage**.
- [ ] ✅ Cost, Calls, Input/Output tokens.
- [ ] ✅ Cost-by-day line chart.
- [ ] ✅ Breakdown by purpose (order_agent, intent_classifier, etc.)
  and by model.
- [ ] The footer warns "±10% accurate" — confirm visible.

---

## Wave 6 — Staff, shift, printer

### 6.1 Staff roles
- [ ] Via Clerk dashboard, invite a new user as a basic member of the
  org. They log in → hit `/dashboard`.
- [ ] ✅ Their sidebar shows only the MEMBER-accessible items
  (Overview, Orders, Kitchen) — no Settings, Menu, Integrations,
  Billing, Campaigns, Analytics.
- [ ] Upgrade them via SQL:
  ```sql
  INSERT INTO "TenantMember" ("id","tenantId","clerkUserId","role","updatedAt")
  VALUES (gen_random_uuid(), '<tenantId>', '<clerk_user_id>', 'KITCHEN', NOW());
  ```
  Refresh → ✅ sidebar now reflects KITCHEN-scope routes.
- [ ] Owner (Clerk org admin with no TenantMember row) → ✅ still sees
  everything (fallback rule).
- ⚠ Server-side enforcement on kitchen-only routes is client-hiding
  only for v1; a MEMBER who types `/dashboard/settings` manually can
  still load the page. Real enforcement is a follow-up.

### 6.2 Shift close-soon
- [ ] In Settings, set today's close time to ~20 minutes from now.
- [ ] Text the bot to order → ✅ flow proceeds normally (outside grace).
- [ ] Roll forward so you're <15 min to close → text again → ✅ bot
  refuses pickups that can't complete before the door locks, offers
  tomorrow's opening instead.
- [ ] Close time passes → text again → ✅ bot treats as "CLOSED", same
  as before (no regression).
- [ ] To tune grace: `UPDATE "TenantConfig" SET "lastOrdersGraceMinutes" = 10 WHERE "tenantId"='…';`

### 6.3 CloudPRNT printer 🧪
- ⚠ Requires a physical Star printer (TSP143 / TM-m30-class) to
  validate end-to-end. Without hardware, only the API surface is
  testable.
- [ ] Generate a token:
  ```sql
  UPDATE "TenantConfig" SET "cloudPrntToken" = 'test-token-123' WHERE "tenantId" = '…';
  ```
- [ ] `curl https://<app>/api/printers/cloudprnt?token=test-token-123` →
  ✅ when no pending orders: `{"jobReady": false}`.
- [ ] Place a PENDING/CONFIRMED order → same curl →
  ✅ `{"jobReady": true, "jobToken": "<orderId>", "mediaTypes": […]}`.
- [ ] `curl -H "Accept: application/vnd.star.starprnt" …&jobToken=<orderId>` →
  ✅ raw ESC/POS bytes. Pipe to `xxd` to sanity-check.
- [ ] `curl -X POST …?token=… -d '{"jobToken":"<orderId>","code":"200"}'` →
  ✅ `Order.printedAt` populated.
- 🧪 With real hardware: set Star printer's Server URL to your endpoint,
  reboot, place an order → ticket prints.

---

## Wave 7 — Marketing

### 7.1 SMS campaigns
- [ ] Dashboard → **Campaigns**. Click **New campaign**.
- [ ] Fill Name + Message. Preview shows auto-appended "Reply STOP to
  opt out" footer.
- [ ] Save draft → appears in the list as DRAFT.
- [ ] Click **Send now** → confirms count → ✅ status flips to SENDING
  then SENT. Counters roll up (sent / suppressed / failed).
- [ ] Test customer receives the SMS with STOP footer included.
- [ ] Reply STOP from a test phone before sending → requeue on the
  same contact → ✅ they're counted as suppressed, not sent.

### 7.2 Loyalty points
- [ ] Place an order for a test contact totaling ~$12 subtotal.
- [ ] ✅ After order save, `Contact.loyaltyPoints` incremented by 12
  (floor of subtotal).
- [ ] Place a second order → ✅ points accumulate.
- ⚠ No UI surface yet — check via SQL: `SELECT "loyaltyPoints" FROM "Contact"…`.

### 7.3 Reviews
- [ ] Place + complete (COMPLETED status) a test order.
- [ ] ✅ 2 hours later an SMS arrives: "How was your order…? Reply
  1-5 (5 = great!)".
- [ ] Reply "5 great!" → ✅ thanks message + `OrderReview` row saved
  with rating=5, comment="great!".
- [ ] Dashboard → **Reviews** → ✅ average, distribution bars, and the
  new review show up.
- [ ] Reply "5" again on the same order → ✅ no second review row; no
  AI order flow triggered (review handler consumes the reply first).
- ⚠ The 2-hour delay uses `waitUntil(setTimeout(…))` which may not
  survive long cold lambdas. For production SLA move this to a cron.

---

## Wave 8 — Conversation depth

### 8.1 Multi-language
- [ ] From a brand-new phone, text: **"Hola, quiero un adobo para las
  6pm."**
- [ ] ✅ Bot replies in Spanish. Confirms the adobo, asks for name.
- [ ] Subsequent turns from this phone stay in Spanish (persistence).
- [ ] ✅ `Contact.preferredLanguage = 'es'` in the DB.
- [ ] Repeat with a Tagalog trigger — "Kumusta, gusto ko ng pancit
  bihon." → ✅ replies in Tagalog, `preferredLanguage = 'tl'`.
- [ ] For English customers (no trigger words): ✅ still English.

### 8.2 Group orders
- [ ] Text: **"One chicken adobo for Maria, two lumpia for Dad."**
- [ ] ✅ Agent calls `add_items_for_person`. KDS card items get
  `personName` tags.
- [ ] On the kitchen printer ticket (6.3 🧪): ✅ ticket groups by
  person with a sub-header per name.
- [ ] Digital receipt `/r/<id>`: currently just lists items flat
  (person grouping isn't surfaced on the receipt — stretch polish).

### 8.3 Recurring orders
- ⚠ No operator UI or customer-facing tool yet — insert a row directly:
  ```sql
  INSERT INTO "RecurringOrder" ("id","tenantId","callerPhone","label","cadence","itemsJson","pickupTime","nextRunAt","updatedAt")
  VALUES (gen_random_uuid()::text, '<tenantId>', '<phone>', 'Test', 'weekly', '[{"menuItemId":"<id>","name":"Lumpia","quantity":2,"price":8}]'::jsonb, '12:00 PM', NOW(), NOW());
  ```
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/recurring-orders`
- [ ] ✅ Response `{ due: 1, created: 1 }`. Customer receives a "Your
  recurring order is placed…" SMS.
- [ ] ✅ A new Order row exists; `RecurringOrder.nextRunAt` advanced
  by 7 days.
- 🧪 Wire this to Vercel Cron / an external scheduler for production —
  see `vercel.json` docs.

---

## Wave 9 — White-label + multi-location

### 9.1 White-label on public menu
- [ ] Set brand values via SQL:
  ```sql
  UPDATE "TenantConfig"
    SET "brandColor" = '#E03A2F',
        "brandLogoUrl" = 'https://…/logo.png',
        "hidePoweredBy" = true
    WHERE "tenantId" = '…';
  ```
- [ ] Open `/m/<slug>`:
  - [ ] ✅ Logo renders next to business name in the header.
  - [ ] ✅ Sticky "Text order" button is the brand color, not blue.
  - [ ] ✅ "Powered by RingBackSMS" footer is hidden.
- [ ] Clear the fields → ✅ falls back to default blue + visible
  attribution without errors.
- 🧪 `/o`, `/r`, `/pay` use default branding for now — hook
  `loadTenantBranding` into those in a later polish pass.

### 9.2 Multi-location foundation
- [ ] ✅ Every existing tenant has exactly one `TenantLocation` row:
  ```sql
  SELECT t.name, l.name AS location_name, l.phone, l."squareLocationId"
  FROM "Tenant" t JOIN "TenantLocation" l ON l."tenantId" = t.id;
  ```
- [ ] `Order.locationId` column exists, nullable, unused by runtime
  yet. No new-order regression.
- ⚠ No UI to manage locations yet — operator-facing
  switcher + per-location menu overrides are the next wave's work.

---

## Cross-cutting smoke tests

- [ ] Flow-engine unit tests: `pnpm --filter @ringback/flow-engine test`
  → **34 passed**.
- [ ] Web typecheck: `pnpm --filter @ringbacksms/web exec tsc --noEmit`
  → clean.
- [ ] End-to-end order (no payment): text bot → confirm → receive
  confirmation + tracker link → KDS advances status → completion
  review SMS.
- [ ] End-to-end paid order: text bot → `/pay/<id>` link → pick tip →
  Stripe → payment complete SMS → `/r/<id>` receipt with tip line.
- [ ] Cancel a paid order → refund arrives in Stripe + customer SMS.
- [ ] Public page access control: open `/o/<id>`, `/r/<id>`,
  `/pay/<id>`, `/m/<slug>` in an incognito tab → all load without
  auth. All have `noindex,nofollow`.

---

## Known gaps to track post-test

- **Wave 6.1**: role enforcement is UX-only (sidebar hiding). A
  MEMBER-role user who types `/dashboard/settings` can still load the
  page. Wire server-side guards in layouts.
- **Wave 6.3**: CloudPRNT scaffolded but untested on hardware.
- **Wave 7.1**: campaign sender uses `waitUntil` — fine for small
  lists, move to a queue for >500 recipients.
- **Wave 7.3**: 2-hour review delay is best-effort on Vercel. Swap to
  cron.
- **Wave 8.3**: no UI for creating RecurringOrder rows; no Vercel cron
  wired to the endpoint yet.
- **Wave 9.1**: only `/m/<slug>` applies branding. Extend to `/o`,
  `/r`, `/pay`.
- **Wave 9.2**: `TenantLocation` is a foundation table only — no
  operator UX, no menu-per-location, no per-location analytics yet.

---

**Total new migrations**: 6. **New commits**: 9. **New endpoints**: 8.
**New public pages**: 3. **New dashboard pages**: 4.
