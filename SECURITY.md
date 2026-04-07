# Security Policy

## Reporting a Vulnerability

We take the security of RingbackSMS and our customers' data seriously. If you
believe you have found a security vulnerability, please report it to us
privately.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, email **security@ringbacksms.com** with:

- A description of the issue
- Steps to reproduce
- Affected components (URLs, endpoints, commit SHAs)
- Any proof-of-concept code or screenshots
- Your name and how you'd like to be credited (optional)

## Our Commitment

- We will acknowledge your report within **3 business days**.
- We will provide a status update within **7 business days**.
- We will work with you to understand and resolve the issue quickly.
- We will credit you in release notes (with permission) once the fix is public.

## Scope

In scope:
- `apps/web/**` — Next.js web application
- `apps/api/**` — Express API service
- `packages/**` — shared packages (flow-engine, shared-types)
- Production deployments at `*.ringbacksms.com`

Out of scope:
- Third-party services we integrate with (Clerk, Stripe, Twilio, Square, Vercel) — report to the respective vendor
- Denial-of-service tests against production infrastructure
- Social engineering attacks against employees or customers
- Physical attacks

## Supported Versions

Only the latest commit on the `main` branch is supported. We do not backport
fixes to older versions.

## Bug Bounty

We do not currently operate a paid bug bounty program, but we deeply appreciate
responsible disclosure and will publicly credit researchers.
