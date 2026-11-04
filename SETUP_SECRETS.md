# VoiceTask — configure secrets using provider dashboards only

Never paste secrets into chat, GitHub issues, frontend `VITE_` variables or a public repository.

## Supabase

Connect the approved production project and apply migrations in version order. Use Supabase Edge Function secrets for: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (normally supplied by the runtime), `ALLOWED_ORIGIN` (exact HTTPS web origin), `CRON_SECRET`, `DEEPGRAM_API_KEY` (optional real transcription and timed speech review), `RESEND_API_KEY`, `RESEND_FROM` (verified sender), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE` (sandbox/live only when authorised). No provider credentials are bundled.

Enable Supabase Auth email login with email confirmation, invitation-only public signup prohibition, device/OTP protection, server rate limiting, CAPTCHA/abuse prevention and tested recovery. Create administrator identity through private console and require AAL2 MFA. Set JWT and session durations appropriate to the risk.

An approved external identity provider and licensed bank payout provider are **not selected or activated**: document/manual-review and bank payout pathways must remain guarded until proper vendors and contracts are in place. Confirm the user-country corridors before enabling payouts.

## GitHub environment `production`

Configure these GitHub Actions **secrets** in a protected environment with required approvals: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `CRON_SECRET`.

Configure safe GitHub **variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_URL`, `ENABLE_PRODUCTION_DEPLOY` (default `false`), `ENABLE_MAINTENANCE` (default `false`).

Trigger the manually approved `Deploy VoiceTask` workflow **only after** secrets and independent production RLS/data checks are complete. `Scheduled VoiceTask Maintenance` runs every five minutes only when the production enable variable and matching server-side `CRON_SECRET` are installed. A scheduled workflow does not itself activate an external ASR/KYC/payout provider.

## Vercel

Create/connect the Vite project in Vercel via the authorised dashboard. The CI deploy job performs `vercel pull`, `vercel build --prod`, and `vercel deploy --prebuilt --prod`; protect the domain and add the final HTTPS origin in Supabase Auth redirect allowlist and Edge Functions `ALLOWED_ORIGIN`.

No private keys, document images, recordings or beneficiary banking credentials belong in a GitHub action log or the Vite build.
