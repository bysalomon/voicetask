# VoiceTask database

Migrations in chronological order: `202611040001_initial.sql` through `202611040012_support.sql`. Do not apply these to a database containing unrelated production data without a rehearsal, backup and privilege audit.

## Ownership and RLS

Profiles, settings, roles, consents and hashed invitation tokens enforce identity, restricted grants and auditable invitations. Published tasks and 1–70 ordered immutable phrases feed per-member assignment snapshots. Assignment slots accrue at two tasks per category per UTC elapsed 24 hours since signup. Policies isolate each member's private tasks, recordings, ledger, KYC and notifications. Administrative views only return data when the authenticated session is MFA AAL2.

## Audio

Recording drafts and submitted immutable metadata reference private Storage objects. A server validator verifies MIME magic, file size, SHA-256, ASR transcription confidence and provider-measured speech duration. `audio_quality_results` stores evidence. `approve_audited_submission` requires validated distinct phrase samples and a fresh human review event, then invokes the atomic approval and GBP reward ledger posting once. Scheduled maintenance never unconditionally approves work.

## Finance

`wallet_accounts` caches available and reserved balances, derived from immutable `wallet_ledger_entries` and balanced journal postings. `withdrawal_requests` reserves funds at £250 minimum only with real KYC and an approved recipient; rejection releases the reserve. `settle_paid_withdrawal_secure` requires a distinct provider event reference, is idempotent and reconciles reservations. `wallet_adjustment_requests` records reason and separate administrator sign-off above £100. Every journal event balances to zero in integer pence.

## Identity, notifications and operations

`identity_verifications`, private `identity_documents`, status/access events and due timestamps preserve review status and evidence access. `broadcast_impressions` is unique per broadcast, user and authentication session. `notifications` support member read status and Realtime. `support_tickets` and `support_messages` enforce ownership/administrator access, with reply notifications. Logs and export metadata are auditable, not public datasets.

Verify all policies and transaction rules with `supabase test db` and the tests under `tests/integration` before enabling production. Local test users, documents, review evidence and reward movements must never be seeded into a live environment.
