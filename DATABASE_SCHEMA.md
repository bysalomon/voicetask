# Database model

Migrations are applied in order: `202611040001_initial.sql`, `202611040002_workflows.sql`, `202611040003_hardening.sql`.

**Member identity:** `profiles`, `user_roles`, `user_settings`, `consent_records`, `invitation_tokens`, `invitation_redemptions`, `invitation_claims`.

**Audio work:** `tasks`, `task_phrases`, `user_task_assignments`, `assignment_events`, `recording_drafts`, `task_submissions`, `recording_files`, `audio_quality_results`.

**Money:** `wallet_accounts`, `wallet_ledger_entries`, `payout_destinations`, `withdrawal_requests`. All amounts are signed integer pence, currency GBP. Available and reserved amounts are cached wallet projections. Reconcile against immutable ledger events before production.

**Compliance and engagement:** `identity_verifications`, `identity_documents`, `identity_status_events`, `verification_access_logs`, `notifications`, `broadcasts`, `broadcast_impressions`, `leaderboard_adjustments`, `rank_history`, `daily_recording_summary`, `audit_logs`, `support_tickets`, `support_messages`, `system_settings`, `partner_exports`, `cron_job_runs`.

All client-visible tables enable RLS. Private audio and identity buckets have **no direct public read policy**. Privileged Edge Functions generate signed URLs for short-lived access. Functions and server grants are separate from React route guards. Verify grants, RLS, and signed-upload protections using two distinct Supabase user identities before launch.
