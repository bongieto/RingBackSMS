# Real-traffic accuracy eval

Replays production conversations through the current flow engine and reports
where the engine's behavior diverges from what the production bot did.

## Why

Synthetic benchmark tests (`packages/flow-engine/src/__tests__/scenarios/accuracy-benchmark.test.ts`)
guard against structural regressions but use hand-crafted cases. The real
accuracy story lives in real customer traffic. This harness ingests Axiom
exports of historical conversations, replays each turn through the current
flow engine, and surfaces:

- Where the new guards (`deflected_pii_change`, `eta_rewritten`, etc.) catch
  hallucinations the original bot emitted.
- Where the new engine's flow-type routing disagrees with the old.
- Distribution shift in reply length and content.

## Usage

```sh
pnpm eval:replay <input.ndjson> [--out report.md] [--mode strict|mock]
```

- `<input.ndjson>` — newline-delimited JSON, one case per line. See
  `scripts/eval/fixtures/sample-axiom-export.ndjson` for the format.
- `--out` — write report to file (default: stdout).
- `--mode strict` (default) — the chatFn replays the original recorded reply.
  Measures **what the post-LLM machinery does** (guards, fact verifier,
  decision tagging) without LLM variance.
- `--mode mock` — the chatFn returns canned shapes. Useful when you don't
  have a recorded reply or want to test engine logic in isolation.

## Case format

Canonical schema is `RealTrafficCase` in
`packages/flow-engine/src/eval/types.ts`. The importer also accepts
Axiom-flavored field names (`From`, `Body`, `botReply`, `tenant_id`, etc.)
and maps them.

Minimum required fields per row:

```json
{
  "id": "SM_abc123",
  "tenantId": "t-1",
  "tenantName": "Lumpia House",
  "callerPhone": "+12175550199",
  "inboundMessage": "refund please",
  "originalReply": "Refund processed, thanks!"
}
```

Optional but valuable:

- `originalFlowType` — what the original bot routed to (for agreement scoring)
- `originalDecisions` — list of `{handler, outcome}` so the report flags
  outcomes the new engine emits that the original didn't
- `callerMemorySnapshot.activeOrder.estimatedReadyTime` — required for
  ETA-rewriter signal
- `hoursInfoSnapshot.openNow` — controls hours-aware routing
- `enabledFlowTypes` — defaults to `["ORDER", "FALLBACK"]`
- `humanLabel.expectedFlowType` — a reviewer's verdict; failed cases against
  this are clear regressions

## Interpreting the report

The report's "divergences" section lists cases where the current engine
produced materially different output. **Divergences are not necessarily
failures** — on hallucination cases (refund/cancel/confirm with no order,
wrong ETA, PII change request) the new behavior is intended.

The most useful section is **"New decision outcomes"**: it counts how
often each new guard/verifier fired across the eval set. Lots of
`eta_rewritten` means the bot was promising wrong ETAs; lots of
`deflected_pii_change` means callers were asking for account changes the
old bot was fabricating responses for.
