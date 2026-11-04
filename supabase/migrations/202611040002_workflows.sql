-- Atomic task entitlements and financial workflows. SECURITY DEFINER functions validate auth.uid().
create or replace function public.allocate_my_tasks() returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_signup timestamptz;v_days integer;v_category public.task_category;v_slots integer;v_existing integer;v_added integer:=0;v_task record;v_slot integer;
begin
 if v_user is null then raise exception 'Unauthenticated';end if;
 select created_at into v_signup from public.profiles where id=v_user and status='active';
 if not found then raise exception 'Account unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 v_days:=greatest(0,floor(extract(epoch from(clock_timestamp()-v_signup))/86400)::integer);
 foreach v_category in array enum_range(null::public.task_category) loop
  v_slots:=2*(v_days+1);
  select count(*) into v_existing from public.user_task_assignments where user_id=v_user and category_snapshot=v_category;
  for v_task in select t.* from public.tasks t where t.category=v_category and t.status='published' and not exists(select 1 from public.user_task_assignments a where a.user_id=v_user and a.task_id=t.id) and exists(select 1 from public.task_phrases p where p.task_id=t.id) order by t.published_at nulls last,t.created_at,t.id limit greatest(0,v_slots-v_existing)
  loop
   v_slot:=v_existing+1;
   insert into public.user_task_assignments(user_id,task_id,category_snapshot,reward_pence_snapshot,task_version_snapshot) values(v_user,v_task.id,v_category,v_task.reward_pence,v_task.version) on conflict do nothing;
   if found then
    insert into public.assignment_events(user_id,category,entitlement_slot,task_id) values(v_user,v_category,v_slot,v_task.id) on conflict do nothing;
    v_added:=v_added+1;v_existing:=v_existing+1;
   end if;
  end loop;
 end loop;
 return v_added;
end $$;
revoke all on function public.allocate_my_tasks() from public;grant execute on function public.allocate_my_tasks() to authenticated;
-- Submission freezes the draft recordings. A task can be paid once, independent of retries.
create or replace function public.submit_my_task(p_assignment_id uuid,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_ass public.user_task_assignments%rowtype;v_phrases integer;v_drafts integer;v_id uuid;
begin
 if v_user is null then raise exception 'Unauthenticated';end if;
 select * into v_ass from public.user_task_assignments where id=p_assignment_id and user_id=v_user for update;
 if not found then raise exception 'Assignment not found';end if;
 if v_ass.status not in ('assigned','in_progress','needs_rerecord') then raise exception 'Assignment cannot be submitted';end if;
 select count(*) into v_phrases from public.task_phrases where task_id=v_ass.task_id;
 select count(*) into v_drafts from public.recording_drafts d join public.task_phrases p on p.id=d.phrase_id where d.assignment_id=v_ass.id and d.user_id=v_user and p.task_id=v_ass.task_id;
 if v_phrases<1 or v_phrases>70 or v_drafts<>v_phrases then raise exception 'All phrases require a saved recording';end if;
 insert into public.task_submissions(assignment_id,user_id,idempotency_key) values(p_assignment_id,v_user,p_idempotency_key) returning id into v_id;
 insert into public.recording_files(submission_id,phrase_id,path,mime_type,byte_size) select v_id,phrase_id,storage_path,mime_type,byte_size from public.recording_drafts where assignment_id=p_assignment_id;
 update public.user_task_assignments set status='submitted' where id=p_assignment_id;
 return v_id;
end $$;
revoke all on function public.submit_my_task(uuid,uuid) from public;grant execute on function public.submit_my_task(uuid,uuid) to authenticated;
-- Reviewer must verify actual speech quality; this RPC never auto-approves on a timer.
create or replace function public.approve_reviewed_submission(p_submission uuid,p_voice_ms bigint,p_reason text,p_validator text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_row record;v_old_seconds bigint;v_level_before int;v_level_after int;
begin
 if current_user <> 'service_role' and not public.is_admin() then raise exception 'Admin or trusted validator required';end if;
 if p_voice_ms<=0 or nullif(trim(p_reason),'') is null or nullif(trim(p_validator),'') is null then raise exception 'Verified duration and rationale required';end if;
 select s.*,a.reward_pence_snapshot,a.user_id as recipient into v_row from public.task_submissions s join public.user_task_assignments a on a.id=s.assignment_id where s.id=p_submission for update;
 if not found then raise exception 'Submission not found';end if;
 if v_row.status='approved' then return false;end if;
 if v_row.status not in('submitted','manual_review','quality_review') then raise exception 'Submission not reviewable';end if;
 if exists(select 1 from public.task_submissions s where s.assignment_id=v_row.assignment_id and s.status='approved') then raise exception 'Assignment already approved';end if;
 update public.wallet_accounts set available_pence=available_pence+v_row.reward_pence_snapshot,liability_ledger_version=liability_ledger_version+1 where user_id=v_row.recipient;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason,created_by) values(v_row.recipient,v_row.reward_pence_snapshot,'task_reward','task_submission',p_submission,'credit','task-credit-'||p_submission::text,p_reason,auth.uid());
 update public.task_submissions set status='approved',approved_at=now(),approved_duration_ms=p_voice_ms,review_reason=p_reason,validator_version=p_validator where id=p_submission;
 update public.user_task_assignments set status='approved' where id=v_row.assignment_id;
 insert into public.notifications(user_id,title,body,type,deep_link) values(v_row.recipient,'Task approved!','Your reward has been added to your wallet.','success','/app/wallet');
 select coalesce(sum(approved_duration_ms),0) into v_old_seconds from public.task_submissions where user_id=v_row.recipient and status='approved';
 v_level_after:=1+(v_old_seconds/3600000>=4)::int+(v_old_seconds/3600000>=12)::int+(v_old_seconds/3600000>=27)::int+(v_old_seconds/3600000>=52)::int+(v_old_seconds/3600000>=92)::int+(v_old_seconds/3600000>=157)::int+(v_old_seconds/3600000>=257)::int+(v_old_seconds/3600000>=407)::int+(v_old_seconds/3600000>=657)::int;
 v_level_before:=1+((v_old_seconds-p_voice_ms)/3600000>=4)::int+((v_old_seconds-p_voice_ms)/3600000>=12)::int+((v_old_seconds-p_voice_ms)/3600000>=27)::int+((v_old_seconds-p_voice_ms)/3600000>=52)::int+((v_old_seconds-p_voice_ms)/3600000>=92)::int+((v_old_seconds-p_voice_ms)/3600000>=157)::int+((v_old_seconds-p_voice_ms)/3600000>=257)::int+((v_old_seconds-p_voice_ms)/3600000>=407)::int+((v_old_seconds-p_voice_ms)/3600000>=657)::int;
 if v_level_after>v_level_before then
 insert into public.rank_history(user_id,from_level,to_level,approved_seconds_at_change) values(v_row.recipient,(array['Beginner','Recruit','Operator','Professional','Specialist','Expert','Elite','Master','Commander','Legend'])[v_level_before],(array['Beginner','Recruit','Operator','Professional','Specialist','Expert','Elite','Master','Commander','Legend'])[v_level_after],v_old_seconds/1000);
 end if;
 return true;
end $$;
-- Never grant approval to authenticated clients (including ordinary admins using browser).
revoke all on function public.approve_reviewed_submission(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.approve_reviewed_submission(uuid,bigint,text,text) to service_role;
create or replace function public.request_my_withdrawal(p_amount_pence bigint,p_destination_id uuid,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_account public.wallet_accounts%rowtype;v_kyc text;v_dest record;v_id uuid;
begin
 if v_user is null then raise exception 'Unauthenticated';end if;
 if p_amount_pence<25000 then raise exception 'Minimum withdrawal is £250.00';end if;
 select status into v_kyc from public.identity_verifications where user_id=v_user order by submitted_at desc limit 1;
 if v_kyc is distinct from 'verified' then raise exception 'Identity verification required';end if;
 select * into v_dest from public.payout_destinations where id=p_destination_id and user_id=v_user and verified=true;
 if not found then raise exception 'Verified payment destination required';end if;
 if not exists(select 1 from public.profiles where id=v_user and status='active') then raise exception 'Account inactive';end if;
 -- All provider processing is disabled until an eligible payout provider is separately enabled.
 if not exists(select 1 from public.system_settings where key='payouts_enabled' and value='true'::jsonb) then raise exception 'Withdrawals are not yet enabled';end if;
 select * into v_account from public.wallet_accounts where user_id=v_user for update;
 if v_account.available_pence<p_amount_pence then raise exception 'Insufficient available funds';end if;
 update public.wallet_accounts set available_pence=available_pence-p_amount_pence,reserved_pence=reserved_pence+p_amount_pence,liability_ledger_version=liability_ledger_version+1 where user_id=v_user;
 insert into public.withdrawal_requests(user_id,requested_pence,destination_id,provider,idempotency_key) values(v_user,p_amount_pence,p_destination_id,v_dest.type,p_idempotency_key) returning id into v_id;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason) values(v_user,-p_amount_pence,'withdrawal_reserve','withdrawal',v_id,'reserve','reserve-'||v_id::text,'Withdrawal funds reserved');
 return v_id;
end $$;
revoke all on function public.request_my_withdrawal(bigint,uuid,uuid) from public;grant execute on function public.request_my_withdrawal(bigint,uuid,uuid) to authenticated;
create or replace function public.reject_withdrawal_secure(p_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_req public.withdrawal_requests%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Server only';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason required';end if;
 select * into v_req from public.withdrawal_requests where id=p_id for update;
 if not found or v_req.status in('paid','rejected','cancelled') then return false;end if;
 if v_req.status='processing' then raise exception 'Provider settlement must be reconciled first';end if;
 update public.wallet_accounts set available_pence=available_pence+v_req.requested_pence,reserved_pence=reserved_pence-v_req.requested_pence,liability_ledger_version=liability_ledger_version+1 where user_id=v_req.user_id;
 update public.withdrawal_requests set status='rejected',rejection_reason=p_reason,resolved_at=now() where id=p_id;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason) values(v_req.user_id,v_req.requested_pence,'withdrawal_release','withdrawal',p_id,'release','release-'||p_id::text,p_reason);
 insert into public.notifications(user_id,title,body,type,deep_link) values(v_req.user_id,'Withdrawal declined','The reserved amount has been returned to your available balance. Reason: '||p_reason,'warning','/app/wallet');
 return true;
end $$;
revoke all on function public.reject_withdrawal_secure(uuid,text) from public,anon,authenticated;grant execute on function public.reject_withdrawal_secure(uuid,text) to service_role;
-- Aggregate only genuine approved tasks. Security definer exposes public display names only.
create or replace function public.community_leaderboard(p_period text default 'week')
returns table(user_id uuid,display_name text,approved_tasks bigint,approved_seconds bigint,points bigint)
language sql stable security definer set search_path='' as $$
with bounds as (select case p_period when 'year' then date_trunc('year',now() at time zone 'UTC') when 'month' then date_trunc('month',now() at time zone 'UTC') else date_trunc('week',now() at time zone 'UTC') end as beginning),
approved as (select s.user_id,count(distinct s.assignment_id) as approved_tasks,coalesce(sum(s.approved_duration_ms/1000),0)::bigint as approved_seconds from public.task_submissions s,bounds b where s.status='approved' and s.approved_at>=b.beginning group by s.user_id)
select a.user_id,coalesce(nullif(trim(p.public_display_name),''),'VoiceTask member') as display_name,a.approved_tasks,a.approved_seconds,(a.approved_tasks*100+coalesce((select sum(x.bonus_points) from public.leaderboard_adjustments x where x.user_id=a.user_id and x.period_scope=p_period),0))::bigint as points from approved a join public.profiles p on p.id=a.user_id where p.status='active' order by points desc,a.approved_tasks desc,a.approved_seconds desc,a.user_id limit 100;
$$;
revoke all on function public.community_leaderboard(text) from public;grant execute on function public.community_leaderboard(text) to authenticated;
-- Non-RLS-bypassing admin summaries are exposed only to admins.
create view public.admin_users with (security_invoker=true) as select p.id,p.full_name,p.email_display,p.country,p.created_at,p.status from public.profiles p;
create view public.admin_overview with (security_invoker=true) as select (select count(*) from public.profiles) total_users,(select coalesce(sum(requested_pence),0) from public.withdrawal_requests where status in('requested','under_review')) pending_withdrawals_pence,(select count(*) from public.identity_verifications where status in('submitted','processing','manual_review')) pending_kyc,(select count(*) from public.task_submissions where status in('submitted','quality_review','manual_review')) pending_submissions;
-- Explicit admin-only view access (underlying RLS still applies).
revoke all on public.admin_users,public.admin_overview from anon;
