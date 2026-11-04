-- Require genuine server-validated files and an auditable listening session for every financial approval.
create or replace function public.approve_audited_submission(p_submission uuid,p_actor uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_assignment uuid;v_status text;v_expected integer;v_actual integer;v_valid integer;v_distinct integer;v_duration bigint;
begin
 if nullif(trim(coalesce(p_reason,'')),'') is null or length(trim(p_reason))<15 then raise exception 'Explain the actual tone and quality review in at least fifteen characters';end if;
 select s.assignment_id,s.status into v_assignment,v_status from public.task_submissions s where s.id=p_submission for update;
 if v_assignment is null or v_status not in('submitted','manual_review','quality_review') then raise exception 'Submission cannot be approved';end if;
 if not exists (select 1 from public.audit_logs where actor_user_id=p_actor and action='audio.review_started' and entity_type='task_submissions' and entity_id=p_submission and created_at>now()-interval '30 minutes') then raise exception 'A fresh audited audio review is required';end if;
 select count(*) into v_expected from public.task_phrases p join public.user_task_assignments a on a.task_id=p.task_id where a.id=v_assignment;
 select count(*),count(*) filter(where r.quality_state='passed' and r.checksum_sha256 is not null and r.voice_seconds_ms>0 and r.duration_ms>=r.voice_seconds_ms and q.final_decision='passed'),count(distinct r.checksum_sha256),coalesce(sum(r.voice_seconds_ms),0)
 into v_actual,v_valid,v_distinct,v_duration
 from public.recording_files r left join public.audio_quality_results q on q.recording_id=r.id where r.submission_id=p_submission;
 if v_expected<1 or v_expected>70 or v_actual<>v_expected or v_valid<>v_expected or v_distinct<>v_expected or v_duration<=0 then
  raise exception 'Every phrase needs distinct, validated server-measured voice audio before approval';
 end if;
 return public.approve_reviewed_submission(p_submission,v_duration,'Human tone review by '||p_actor::text||': '||p_reason,'deepgram-asr+human-tone-v1');
end $$;
revoke all on function public.approve_audited_submission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_audited_submission(uuid,uuid,text) to service_role;
-- A member must not be able to infer administration counts via invoker views.
create or replace view public.admin_users with(security_invoker=true) as
select p.id,p.full_name,p.email_display,p.country,p.created_at,p.status
from public.profiles p where public.is_admin();
create or replace view public.admin_overview with(security_invoker=true) as
select (select count(*) from public.profiles) total_users,
(select coalesce(sum(requested_pence),0) from public.withdrawal_requests where status in('requested','under_review')) pending_withdrawals_pence,
(select count(*) from public.identity_verifications where status in('submitted','processing','manual_review')) pending_kyc,
(select count(*) from public.task_submissions where status in('submitted','quality_review','manual_review')) pending_submissions
where public.is_admin();
create or replace view public.admin_analytics with(security_invoker=true) as
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
 (select count(*) from public.identity_verifications where status in('submitted','processing','manual_review') and due_at<now()) as overdue_kyc
where public.is_admin();
grant select on public.admin_users,public.admin_overview,public.admin_analytics to authenticated;
