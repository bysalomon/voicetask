-- Admin analytics. RLS-aware aggregates: read only by administrators.
create or replace view public.admin_analytics with (security_invoker=true) as
select
 (select count(*) from public.profiles) as total_users,
 (select count(*) from public.profiles where created_at >= now()-interval '7 days') as new_users_last_7_days,
 (select count(*) from public.tasks where status='published') as published_tasks,
 (select count(*) from public.user_task_assignments where status='approved') as approved_assignments,
 (select count(*) from public.task_submissions where status in('submitted','quality_review','manual_review')) as pending_reviews,
 (select coalesce(sum(approved_duration_ms),0) from public.task_submissions where status='approved') as approved_audio_ms,
 (select coalesce(sum(amount_pence),0) from public.wallet_ledger_entries where entry_type='task_reward') as approved_reward_pence,
 (select coalesce(sum(available_pence+reserved_pence),0) from public.wallet_accounts) as current_wallet_liability_pence,
 (select count(*) from public.withdrawal_requests where status in('requested','under_review')) as pending_withdrawals,
 (select count(*) from public.identity_verifications where status in('submitted','processing','manual_review') and due_at<now()) as overdue_kyc;
revoke all on public.admin_analytics from anon;
grant select on public.admin_analytics to authenticated;
create policy "admin assignments" on public.assignment_events for select to authenticated using(public.is_admin());
create policy "admin journal" on public.wallet_accounts for select to authenticated using(public.is_admin());
create policy "admin ticket messages" on public.support_messages for select to authenticated using(public.is_admin());
