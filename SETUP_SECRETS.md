# Provider setup: secrets only

## Local frontend

Provide only the publishable values `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. **Never** put service-role keys, API passwords, payout tokens or personal ID data in Vite env variables.

## Supabase Edge Function secrets

Configure in Supabase's secrets manager: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (provisioned securely), `ALLOWED_ORIGIN` (your verified HTTPS domain), `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`. Delivery domain must be verified. Identity review and speech validation providers require server-only credentials when selected; no provider is silently assumed enabled.

## GitHub Actions

Set protected environment `production` with approval policy; set repository variable `ENABLE_PRODUCTION_DEPLOY=true` **only after auditing**. Environment secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Repository variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

No secrets belong in commits or issues. Configure Supabase Auth email settings, allowed callback URLs, email-confirmation enforcement, rate limits, CAPTCHA, anti-abuse protections, and fully disable public account creation only after the invitation flow is verified.
