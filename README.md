# VoiceTask

VoiceTask is an invitation-only voice recording and review platform, based on **React + Vite + TypeScript** and **Supabase PostgreSQL/Auth/Storage/Edge Functions**. The interface uses **British English** and GBP pence for all money.

## Status

This repository contains a working UI and the foundation of a secure backend. **It is not an activated production service.** A Supabase project, private server secrets, approved payment/KYC/audio-review providers and security testing are mandatory before accepting real participants. Never assume submitted audio has passed a quality review merely because five minutes elapsed.

## Run locally

1. Install Node.js 22+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from a controlled Supabase project.
3. For local backend: `npx supabase start`, then `npx supabase db reset` **only against local development**.
4. Run `npm run dev`. Test with `npm run typecheck && npm run lint && npm test && npm run build`.

## Architecture

- `src/components/Landing.tsx`: cinematic landing with the official voice-training background video and information dialogs.
- `src/pages/Dashboard.tsx`: responsive member area and KPIs with true database state.
- `src/pages/Tasks.tsx`: catalogue and MediaRecorder capture, private signed uploads, task submission.
- `src/pages/Member.tsx`: profile, private ID verification, wallet, leaderboard and settings.
- `src/pages/Admin.tsx`: protected administrative pages and task management.
- `supabase/migrations`: versioned schema, RLS, task assignment, wallet ledger, validation boundaries.
- `supabase/functions`: Edge Functions for invitations, tasks, private uploads, admin actions and maintenance.

## Safety invariants

- Initial allowance: 2 new tasks per category per 24h from account creation, cumulative, counted by assigned tasks (never by unfinished tasks).
- Each task has 1–70 phrases and is paid once for an **actually approved** submission.
- Audio review is not automatically approved in demo or by elapsed time. A trusted validator must supply evidence and server-measured approved durations.
- KYC is never approved by a seven-day timer. Identity documents are private; only validated review decisions count.
- Withdrawal minimum is £250 and KYC must be verified; withdrawal processing is **off** until server-side provider setup.
- Admin access requires the database role, strong password and a verified MFA factor. No client admin bootstrap.
- Ledger entries are immutable from user clients; money operations run inside server transactions.

See [SETUP_SECRETS.md](SETUP_SECRETS.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [ADMIN_BOOTSTRAP.md](ADMIN_BOOTSTRAP.md) and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).
