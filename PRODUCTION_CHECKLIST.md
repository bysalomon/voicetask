# Production readiness — activation checklist

- [ ] Provision a dedicated Supabase project; apply migrations and independently verify PostgreSQL constraint/RLS grants and both private storage buckets.
- [ ] Run real multi-user RLS tests: A cannot see B's private files, money, documents or roles; a member cannot act as admin.
- [ ] Enable server-side invitation verification and trusted email delivery with abuse controls; disable ordinary public signup and enforce email verification, PIN attempt protection and additional factors.
- [ ] Configure admin MFA, secure browser sessions, audit visibility and operator bootstrap; test denied member access.
- [ ] Implement and verify server-side audio metadata inspection (file integrity, checksum, actual duration, audible speech, ASR and voice quality); do not enable automated money approvals until reviewer evidence is trustworthy.
- [ ] Integrate and audit licensed identity verification provider, signed webhooks and retention; do not auto-verify based on SLA elapsed time.
- [ ] Configure PayPal Payouts and/or authorised bank payout provider, recipient verification, payout settlement proof and webhook signatures; only then enable withdrawals in `system_settings`.
- [ ] Complete accounting reconciliation, double-spend races, backup/restore, service alerts and rate limiting.
- [ ] Complete legal UK/FR/IT/US privacy terms and consent, DPIA where applicable, international transfer, age verification, voice-data licensing, buyer obligations and deletion/export workflow.
- [ ] Configure verified domain, CSP, secure CORS, email templates and WhatsApp opt-in, and review accessibility, mobile states and browser audio formats.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, SQL integration/RLS tests and end-to-end tests on staging. Confirm GitHub Actions all green.
- [ ] Deploy frontend and Edge Functions through approved production environment and verify real services are accessible before advertising launch.

**Disabled until proven ready:** live withdrawal processing, automated ASR credits, automated identity decisions, public marketing counts, partner exports of identifiable voice recordings.
