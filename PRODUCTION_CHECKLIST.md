# VoiceTask Production Acceptance

## Code and isolated local validation

- [x] Version-controlled Vite frontend and Supabase migrations, Edge Functions, protected private buckets and explicit payout/KYC state gates exist in GitHub.
- [x] Playwright public landing, navigation, access-guard and mobile journeys ran in GitHub Actions against a test web server.
- [x] PostgreSQL migrations, pgTAP schema/RLS checks, multi-member isolation and concurrent task allowance succeeded in a **disposable local Supabase instance** on at least one CI run.
- [x] Ledger credit idempotency, balanced journal, KYC refusal without evidence, two-administrator large adjustment and withdrawal reservation/release passed real local SQL/API integration tests in a test environment.
- [ ] Latest HEAD has a fully green CI run including the authenticated member upload browser journey. Confirm actual run and inspect any failures before marking complete.
- [ ] Full Edge Function compile and provider-contract smoke tests, load testing, bank reconciliation and external ASR/KYC webhooks validated in staging.

## Production activation (not yet executed)

- [ ] Authorise/connect a real Supabase project to this repository. Apply all migrations, verify private Storage, grants and policies with two real nonadministrative test accounts.
- [ ] Connect Vercel to this repo, configure safe `VITE_` variables, deploy and verify the HTTPS domain, responsive behaviour, Auth callbacks and correct CORS.
- [ ] Set up secure email delivery, invitation-only public signup, PIN attempt protection, email confirmation, OTP/MFA protection and operator bootstrap with mandatory admin AAL2.
- [ ] Configure real Deepgram/independent speech validation, demonstrate correct rejection and audited human tone approval with recorded real voice data. Do not pay for unverified ASR.
- [ ] Select and contract a lawful identity verification provider for UK/US/FR/IT or validated trained manual review, with signed verification decisions and retention/deletion policies.
- [ ] Activate authorised PayPal Payouts/business account, verify beneficiary ownership and payout jurisdictions, validate signed webhooks/reconciliation/fee previews, or select an approved bank transfer provider.
- [ ] Only after compliant settlement and KYC are proved, set `system_settings.payouts_enabled=true` in a privileged approved console and enable protected production workflows.
- [ ] Provision secrets in Supabase/Provider/GitHub secret managers (never chat), configure protected `production` approvals and enable credential-gated maintenance scheduling.
- [ ] Obtain final UK/US/FR/IT legal terms, age eligibility, privacy/consent/biometric voice data assessment, partner-licensing rights, retention, deletion and subject access pathways.
- [ ] Confirm operations: service alerts, queue retries/dead-letter, anti-fraud risk rules, storage usage, budget/forecast, backups and disaster recovery.
- [ ] Verify independent penetration/security tests, browser mic failure/retry and accessible 1600×900, 1366×768, 1024×768, 390×844 screens.

No live deployment, paid reward, identity decision or external provider should be claimed solely because code, migrations or tests are committed.
