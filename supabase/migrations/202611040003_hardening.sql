-- Final hardening for server jobs, invitation claims and admin access.
create table public.invitation_claims(token_id uuid primary key references public.invitation_tokens(id),claimed_at timestamptz not null default now(),claim_expires_at timestamptz not null default(now()+interval '10 minutes'));
alter table public.invitation_claims enable row level security;
create or replace function public.claim_invite_for_registration(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 select id into v_id from public.invitation_tokens where token_hash=p_hash and revoked_at is null and (expires_at is null or expires_at>now()) and uses<max_uses for update;
 if not found then return null;end if;
 if exists(select 1 from public.invitation_claims where token_id=v_id and claim_expires_at>now()) then return null;end if;
 delete from public.invitation_claims where token_id=v_id;
 insert into public.invitation_claims(token_id) values(v_id);
 update public.invitation_tokens set uses=uses+1 where id=v_id;
 return v_id;
end $$;
revoke all on function public.claim_invite_for_registration(text) from public,anon,authenticated;grant execute on function public.claim_invite_for_registration(text) to service_role;
create or replace function public.release_invite_claim(p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 select id into v_id from public.invitation_tokens where token_hash=p_hash for update;
 if v_id is not null then
  if exists(select 1 from public.invitation_claims where token_id=v_id) then
   delete from public.invitation_claims where token_id=v_id;
   update public.invitation_tokens set uses=greatest(0,uses-1) where id=v_id;
  end if;
 end if;
end $$;
revoke all on function public.release_invite_claim(text) from public,anon,authenticated;grant execute on function public.release_invite_claim(text) to service_role;
-- The first migration already restricts approval to service_role through EXECUTE grants.
-- current_user inside SECURITY DEFINER is the function owner, not the calling database role.
create or replace function public.approve_reviewed_submission(p_submission uuid,p_voice_ms bigint,p_reason text,p_validator text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_row record;v_old_ms bigint;v_previous bigint;v_level_before int;v_level_after int;v_levels text[]:=array['Beginner','Recruit','Operator','Professional','Specialist','Expert','Elite','Master','Commander','Legend'];v_thresholds bigint[]:=array[0,4,12,27,52,92,157,257,407,657];v_i integer;
begin
 if p_voice_ms<=0 or length(trim(coalesce(p_reason,'')))<10 or nullif(trim(p_validator),'') is null then raise exception 'Verified duration, assessment and rationale required';end if;
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
 select coalesce(sum(approved_duration_ms),0) into v_old_ms from public.task_submissions where user_id=v_row.recipient and status='approved';
 v_previous:=v_old_ms-p_voice_ms;v_level_before:=1;v_level_after:=1;
 for v_i in 2..10 loop
  if v_previous>=v_thresholds[v_i]*3600000 then v_level_before:=v_i;end if;
  if v_old_ms>=v_thresholds[v_i]*3600000 then v_level_after:=v_i;end if;
 end loop;
 if v_level_after>v_level_before then insert into public.rank_history(user_id,from_level,to_level,approved_seconds_at_change) values(v_row.recipient,v_levels[v_level_before],v_levels[v_level_after],v_old_ms/1000);end if;
 return true;
end $$;
revoke all on function public.approve_reviewed_submission(uuid,bigint,text,text) from public,anon,authenticated;grant execute on function public.approve_reviewed_submission(uuid,bigint,text,text) to service_role;
create or replace function public.reject_withdrawal_secure(p_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_req public.withdrawal_requests%rowtype;
begin
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason required';end if;
 select * into v_req from public.withdrawal_requests where id=p_id for update;
 if not found or v_req.status in('paid','rejected','cancelled') then return false;end if;
 if v_req.status='processing' then raise exception 'Reconcile provider status first';end if;
 update public.wallet_accounts set available_pence=available_pence+v_req.requested_pence,reserved_pence=reserved_pence-v_req.requested_pence,liability_ledger_version=liability_ledger_version+1 where user_id=v_req.user_id;
 update public.withdrawal_requests set status='rejected',rejection_reason=p_reason,resolved_at=now() where id=p_id;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason) values(v_req.user_id,v_req.requested_pence,'withdrawal_release','withdrawal',p_id,'release','release-'||p_id::text,p_reason);
 insert into public.notifications(user_id,title,body,type,deep_link) values(v_req.user_id,'Withdrawal declined','The reserved amount has been returned to your available balance. Reason: '||p_reason,'warning','/app/wallet');
 return true;
end $$;
revoke all on function public.reject_withdrawal_secure(uuid,text) from public,anon,authenticated;grant execute on function public.reject_withdrawal_secure(uuid,text) to service_role;
-- Admin roles cannot be granted by editing JWT user metadata.
create policy "admin invitations" on public.invitation_tokens for select to authenticated using(public.is_admin());
create policy "admin verifications" on public.identity_verifications for all to authenticated using(public.is_admin()) with check(public.is_admin());
-- Direct writes remain revoked: all decisions must pass audited Edge Functions.
create policy "admin withdrawals" on public.withdrawal_requests for select to authenticated using(public.is_admin());
create policy "admin ledger" on public.wallet_ledger_entries for select to authenticated using(public.is_admin());
create policy "admin support" on public.support_messages for insert to authenticated with check(public.is_admin() or exists(select 1 from public.support_tickets t where t.id=ticket_id and t.owner_id=auth.uid() and sender_id=auth.uid()));
create policy "admin leaderboard adjustments" on public.leaderboard_adjustments for select to authenticated using(public.is_admin());
create policy "admin dataset" on public.partner_exports for select to authenticated using(public.is_admin());
create policy "admin payouts settings" on public.system_settings for select to authenticated using(public.is_admin());
-- Freeze published task details to avoid changing assignment snapshots.
create or replace function public.prevent_published_task_edit() returns trigger language plpgsql as $$
begin
 if old.status='published' and (new.reward_pence is distinct from old.reward_pence or new.title is distinct from old.title or new.category is distinct from old.category or new.instructions is distinct from old.instructions) then raise exception 'Published tasks must be cloned to change content or reward';end if;
 return new;
end $$;
create trigger immutable_published_task before update on public.tasks for each row execute function public.prevent_published_task_edit();
create or replace function public.prevent_published_phrase_edit() returns trigger language plpgsql as $$
declare v_task uuid;v_status public.task_state;
begin
 v_task:=coalesce(new.task_id,old.task_id);
 select status into v_status from public.tasks where id=v_task;
 if v_status<>'draft' then raise exception 'Published phrases cannot be changed';end if;
 return coalesce(new,old);
end $$;
create trigger immutable_published_phrase before insert or update or delete on public.task_phrases for each row execute function public.prevent_published_phrase_edit();
-- Internal database views need permissions on underlying relations. RLS still restricts records.
grant select on public.admin_users,public.admin_overview to authenticated;
