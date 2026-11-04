# VoiceTask

VoiceTask is an invitation-only voice recording platform with a British-English React/Vite member experience and a Supabase PostgreSQL, Auth, private Storage and Edge Functions backend. Monetary amounts are integer GBP pence. This is source code, not a live production launch.

## Working source flows

- Cinematic VoiceTask landing with the supplied video and brand; no unverified public marketing claims.
- Invitation-based registration (server-only token claim, account creation, verified email delivery once Resend is configured), eight-digit member access code; separate MFA-protected admin access.
- Member workspace, six task categories, cumulative 2-per-category 24-hour entitlement, recorder with real microphone waveform and private signed storage uploads.
- Server-checked complete task submission, verified transcription/voice duration adapter, human tone review queue, atomic approval and single wallet credit.
- GBP wallet journal, real KYC gate, recipient enrolment, minimum £250, reserved balances, rejected withdrawal releases and provider-confirmed settlement adapter.
- Identity documents private, front/back uploads, actual human-reviewed verification, event timeline and 7-day SLA without fake time-based approval.
- Admin task creation, reviewed audio/ID player, member suspension, notifications, support tickets, broadcasts, dual-admin wallet adjustments, operational analytics, private audit trails.
- GitHub CI with unit tests, real local Supabase SQL/RLS/financial race tests and Playwright desktop/mobile tests. A separate authenticated browser test exercises actual microphone storage when the local function runner is available.

## Status and provider boundaries

**Not deployed or approved for production.** No managed Supabase project has been provisioned from this repository, and no live Vercel URL has been verified. GitHub commits are not database migrations executed on an external service. Before operating, configure Supabase Auth safeguards (captcha/rate limiting, verified email, 8-digit access-code risk mitigation), operator bootstrap/MFA, data-use contracts, retention, audio-review provider, KYC compliance, verified payout recipients, PayPal Payouts or an approved banking provider, and secure webhooks.

Automatic cash credits are **not** inferred after five minutes: submitted audio must pass independent ASR/content/timing/integrity review and human tone review before a single transactional credit. The maintenance job only queues evidence-backed/manual review. Likewise, time elapsed does not verify an identity. Money never becomes paid solely from an admin click.

## Quick start

1. Install Node.js 22+, then `npm install`.
2. Copy `.env.example` to `.env.local` and set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the actual development project.
3. Start an isolated local backend with `npx supabase start`; only use `npx supabase db reset` against local disposable data.
4. Run `npm run dev`; execute `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e`.
5. For local database/Edge tests see `.github/workflows/ci.yml` and `tests/integration`. Never run integration fixtures on production.

## Directory layout

- `src/pages`: member dashboard, tasks/recorder, wallet/profile/KYC/settings/leaderboard, admin, support, public information.
- `src/components`: navigational layouts, signed-audio reviewer, user controls, charts, notifications.
- `supabase/migrations`: versioned PostgreSQL schema, strict RLS, atomic finance functions, identity and voice review, message policies.
- `supabase/functions`: token claims, task management, storage signing, ASR review, admin controls, payout adapter, verified PayPal webhooks and scheduled maintenance.
- `tests/integration`, `supabase/tests`, `tests/e2e`: isolated real database, money concurrency, SQL policies and browser journeys.
- `.github/workflows`: CI, explicit production deployment and credential-protected scheduled queue processing.

See `SETUP_SECRETS.md`, `DATABASE_SCHEMA.md`, `ADMIN_BOOTSTRAP.md` and `PRODUCTION_CHECKLIST.md`.
