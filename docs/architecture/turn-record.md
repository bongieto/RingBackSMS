# Turn Record (Phase 1 observability)

## What a Turn is

A **Turn** is one immutable row per inbound SMS cycle. It captures:

- The inbound message (Twilio SID, encrypted body, received-at).
- A snapshot of `Tenant.config` and per-caller state at the start of the cycle.
- An ordered list of **Decisions** — one row per pre-handler or flow-handler
  branch we took, on both hit and miss paths.
- The terminal `TurnOutcome` (enum), the reply body (encrypted), and timings.

One inbound webhook POST ⇒ exactly one Turn row + N Decision rows, written
atomically at the end via a single Prisma nested-create.

### Relation to existing domain objects

- `Conversation` — the long-lived transcript per (tenant, caller). One
  conversation spans many turns. When a turn causes a state transition, the
  updated Conversation row carries `causingTurnId` pointing back at it.
- `Order` — each order carries `causingTurnId` for the turn that created it,
  so you can trace an order back to the exact inbound message that produced
  it.
- `SmsSuppression` — rows written by the compliance pre-handler carry
  `causingTurnId`. This is the specific back-pointer that would have
  diagnosed the Lumpia sentinel incident in one query.
- `Contact` — unchanged; you can join through `callerPhone + tenantId`.

`Conversation.messages` holds the user-visible transcript; `Turn` holds the
engineering observability layer. They are complementary, not replacements
for each other.

## Querying turns for debugging

### Recent turns for a caller

```sql
SELECT id, outcome, "outcomeReason", "durationMs", "createdAt"
FROM "Turn"
WHERE "tenantId" = $1 AND "callerPhone" = $2
ORDER BY "createdAt" DESC
LIMIT 20;
```

### Full decision trail for a turn

```sql
SELECT sequence, handler, phase, outcome, reason, "durationMs", evidence
FROM "Decision"
WHERE "turnId" = $1
ORDER BY sequence ASC;
```

### "Why did this caller stop getting replies?" — trace suppressions

```sql
SELECT s.*, t."inboundBodyEncrypted", t."createdAt"
FROM "SmsSuppression" s
LEFT JOIN "Turn" t ON t.id = s."causingTurnId"
WHERE s."tenantId" = $1 AND s."callerPhone" = $2;
```

### Prisma equivalent

```ts
const turn = await prisma.turn.findFirst({
  where: { tenantId, callerPhone },
  orderBy: { createdAt: 'desc' },
  include: { decisions: { orderBy: { sequence: 'asc' } } },
});
```

### Log search

Every turn emits one structured log line via Winston → Axiom:

```
turn_receipt { turnId, tenantId, outcome, handlerPath, replyLen, durationMs, llmCalled, llmLatencyMs, decisionCount }
```

`handlerPath` is a `>`-joined chain like
`checkSuppression:miss>handleHoursIntent:hit` — the quickest way to see what
a turn did without pulling rows.

## Adding a new handler

**Every new pre-handler or flow-handler must call `recordDecision` (or
`pushDecision` in flow-engine) on every code path — hit AND miss.**

### apps/web pre-handlers

```ts
import { recordDecision } from '@/lib/server/turn/TurnContext';

export async function handleThing(ctx: PreHandlerContext) {
  const t0 = Date.now();
  const hit = matchesThing(ctx.body);
  if (!hit) {
    recordDecision({
      handler: 'handleThing',
      phase: 'PRE_HANDLER',
      outcome: 'miss',
      durationMs: Date.now() - t0,
    });
    return null;
  }

  const reply = buildReply();
  recordDecision({
    handler: 'handleThing',
    phase: 'PRE_HANDLER',
    outcome: 'thing_hit',
    evidence: { pattern: '…' },
    durationMs: Date.now() - t0,
  });
  return reply;
}
```

### packages/flow-engine flow handlers

flow-engine is Prisma-free and has no AsyncLocalStorage. Use `pushDecision`
with the `input.decisions` array the host threaded in:

```ts
import { pushDecision } from '../decisions';

export async function processFooFlow(input: FlowInput): Promise<FlowOutput> {
  const t0 = Date.now();
  // …handler body…
  pushDecision(input, {
    handler: 'fooFlow',
    phase: 'FLOW',
    outcome: 'step_whatever',
    durationMs: Date.now() - t0,
  });
  return output;
}
```

When `input.decisions` is absent (tests, callers that don't record),
`pushDecision` is a silent no-op. Handlers must never depend on the sink
existing.

## Adding a new `TurnOutcome`

1. Add the literal to `packages/shared-types/src/turn.ts` `TurnOutcome`.
2. Add the value to the `TurnOutcome` enum in
   `apps/api/prisma/schema.prisma`.
3. Create a migration (`prisma migrate dev --name add_outcome_xxx`).
4. Map at least one return path in `flowEngineService.processInboundSms` (or
   the relevant caller) to the new outcome so it's actually produced.
5. Rebuild `@ringback/shared-types` (`pnpm --filter @ringback/shared-types
   build`) so the downstream type is visible.

## Known limitations

- **No shadow state for the bot tester yet.** The tester uses the same
  Redis and Postgres namespaces as production for the same tenant; a stuck
  row still affects both, though `/api/admin/bot-tester/reset` is now
  Turn-aware (deletes Turn rows for the sentinel).
- **Handler ordering is still implicit** — expressed by the sequence of
  calls in `processInboundSmsInner`, not by a registry.
- **Retention policy is TBD.** ~150k Decision rows / month at current
  volume. Follow-up ticket once we have 30 days of production soak.
- **`recordDecision` outside a Turn scope** — warns once per process and
  no-ops. Expected when `TURN_RECORD_ENABLED !== '1'` or for stray calls
  from background jobs.

## Lint helper

Pre-handler exports must call `recordDecision` on every branch. Cheap
grep-based CI check (add to `package.json` scripts or a pre-commit hook):

```sh
# Fail if any pre-handler file adds a new exported async function without a
# recordDecision call somewhere in its body.
! awk '
  /^export async function/ { fn = $0; has = 0; next }
  /recordDecision\(/ { has = 1 }
  /^}/ { if (fn && !has) { print FILENAME": missing recordDecision in "fn; code=1 } fn=""; has=0 }
  END { exit code+0 }
' apps/web/src/lib/server/services/preHandlers.ts
```

This catches the regression mode that caused the Lumpia incident: a
handler silently returning without logging its miss path.

## Rollout & feature flag

Gated by env `TURN_RECORD_ENABLED`. Default off. When off, `withTurn` is a
passthrough: handler runs, no ALS scope, no DB writes, no Sentry tags.
`recordDecision` is a no-op.

Rollout phases (see the plan at
`.claude/plans/reflective-sleeping-porcupine.md` for specifics):

1. **M1**: Ship code with flag off. No behavior change.
2. **M2**: Flip on in staging. Run 48h. Diff 500 replies before vs. after.
3. **M3**: Flip on in production during a low-traffic window.
4. **Rollback**: flip flag off; tables stay; zero data loss.
