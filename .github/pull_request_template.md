<!--
Keep the PR description tight — reviewers will thank you. Delete
sections that don't apply. Link the issue / audit finding / ADR in
"Context" so context travels with the commit history.
-->

## Summary

<!-- 1–3 sentences. What does this PR change, and why now? -->

## Context

<!-- One or more of:
     - Closes #123
     - Addresses audit finding 3.7 (rate limiting on auth endpoints)
     - Follow-up to ADR-001 (docs/architecture/strict-slot-sequence.md)
     - Customer incident 2026-04-18 (see internal ticket)
-->

## Changes

<!-- Bulleted list. One bullet per logical change. Call out any
     schema migrations, new env vars, or behavior changes that
     operators need to know about. -->

-

## Testing

<!-- How did you verify this? Delete lines that don't apply. -->

- [ ] Unit tests pass (`pnpm test`)
- [ ] Type-check clean (`pnpm --filter=@ringbacksms/web exec tsc --noEmit` and/or `pnpm --filter=@ringbacksms/api exec tsc --noEmit`)
- [ ] Manually exercised the happy path in dev
- [ ] Manually exercised at least one failure path

<!-- If you added a migration: -->
- [ ] Migration runs clean on an empty DB and on a copy of prod
- [ ] Rollback plan documented (or not possible — call it out)

<!-- If you changed env vars: -->
- [ ] Added / updated entries in `apps/web/.env.example` and/or `apps/api/.env.example`

## Risk + rollout

<!-- Answer the questions that actually apply to this PR. -->

- **Blast radius**: <!-- who can this affect if it's wrong? e.g. "all inbound SMS for all tenants" / "only the /admin dashboard" / "nothing customer-facing" -->
- **Feature-flagged?**: <!-- yes/no; if yes, what's the flag -->
- **Cache implications**: <!-- e.g. "bumps tenant-context cache version key" or "no cache touched" -->
- **Rollback**: <!-- revert-safe? any migration that would need a reverse migration? -->

## Notes for the reviewer

<!-- Anything non-obvious you want eyeballs on. Gotchas, places where
     you weren't sure, things you deliberately didn't do. -->
