-- Manual payout operations: no provider API creates or settles a payment.
-- A member requests and reserves earnings; staff pays off-platform and records proof.
insert into public.system_settings(key,value)
values ('payout_mode','"manual"'::jsonb),
       ('withdrawal_requests_enabled','true'::jsonb),
       ('payouts_enabled','false'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

create or replace function public.request_my_withdrawal(
  p_amount_pence bigint,p_destination_id uuid,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_account public.wallet_accounts%rowtype;
v_kyc text;v_dest record;v_id uuid;
begin
  if v_user is null then raise exception 'Unauthenticated';end if;
  if p_amount_pence<25000 then raise exception 'Minimum withdrawal is £250.00';end if;
  select status into v_kyc from public.identity_verifications
    where user_id=v_user order by submitted_at desc limit 1;
  if v_kyc is distinct from 'verified' then raise exception 'Identity verification required';end if;
  select * into v_dest from public.payout_destinations
    where id=p_destination_id and user_id=v_user and verified=true;
  if not found then raise exception 'Staff-approved payment destination required';end if;
  if not exists(select 1 from public.profiles where id=v_user and status='active') then
    raise exception 'Account inactive';
  end if;
  if not exists(select 1 from public.system_settings where key='payout_mode' and value='"manual"'::jsonb)
     or not exists(select 1 from public.system_settings where key='withdrawal_requests_enabled' and value='true'::jsonb)
  then raise exception 'Manual withdrawal requests are not enabled';end if;
  select * into v_account from public.wallet_accounts where user_id=v_user for update;
  if v_account.available_pence<p_amount_pence then raise exception 'Insufficient available funds';end if;
  update public.wallet_accounts
     set available_pence=available_pence-p_amount_pence,
         reserved_pence=reserved_pence+p_amount_pence,
         liability_ledger_version=liability_ledger_version+1
   where user_id=v_user;
  insert into public.withdrawal_requests(user_id,requested_pence,destination_id,provider,idempotency_key)
    values(v_user,p_amount_pence,p_destination_id,v_dest.type,p_idempotency_key) returning id into v_id;
  insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason)
    values(v_user,-p_amount_pence,'withdrawal_reserve','withdrawal',v_id,'reserve','reserve-'||v_id::text,
           'Manual payout requested; funds reserved until paid or declined.');
  insert into public.notifications(user_id,title,body,type,deep_link)
    values(v_user,'Withdrawal received',
           'Our team will review your request and send the funds manually. This is not a payment confirmation.',
           'information','/app/wallet');
  return v_id;
end $$;
revoke all on function public.request_my_withdrawal(bigint,uuid,uuid) from public,anon;
grant execute on function public.request_my_withdrawal(bigint,uuid,uuid) to authenticated;

create or replace function public.staff_verify_payment_destination(
 p_destination uuid,p_actor uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_dest record;
begin
 if length(trim(coalesce(p_reason,'')))<15 then raise exception 'Verification reason required (15 characters)';end if;
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then
   raise exception 'Administrator required';end if;
 select d.id,d.user_id,d.type,d.verified into v_dest from public.payout_destinations d
   where d.id=p_destination for update;
 if not found then raise exception 'Payment destination not found';end if;
 if v_dest.verified then return false;end if;
 update public.payout_destinations set verified=true where id=p_destination;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_filtered)
 values(p_actor,'payout.recipient_staff_approved','payout_destinations',p_destination,
        jsonb_build_object('reason',p_reason,'mode','manual','recipient_ownership_checked_by_staff',true));
 insert into public.notifications(user_id,title,body,type,deep_link)
 values(v_dest.user_id,'Payment destination approved',
        'Your payment destination was approved for manual payout requests.','information','/app/wallet');
 return true;
end $$;
revoke all on function public.staff_verify_payment_destination(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_verify_payment_destination(uuid,uuid,text) to service_role;

create or replace function public.staff_start_manual_payout(
 p_id uuid,p_actor uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.withdrawal_requests%rowtype;
begin
 if length(trim(coalesce(p_reason,'')))<15 then raise exception 'Processing note required';end if;
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then raise exception 'Administrator required';end if;
 select * into r from public.withdrawal_requests where id=p_id for update;
 if not found then raise exception 'Withdrawal not found';end if;
 if r.status='processing' then return false;end if;
 if r.status<>'approved' then raise exception 'Withdrawal must be approved first';end if;
 if not exists(select 1 from public.payout_destinations d where d.id=r.destination_id and d.user_id=r.user_id and d.verified) then
   raise exception 'Recipient approval required';end if;
 if not exists(select 1 from public.system_settings where key='payout_mode' and value='"manual"'::jsonb) then
   raise exception 'Manual payout mode disabled';end if;
 update public.withdrawal_requests set status='processing' where id=p_id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_filtered)
 values(p_actor,'payout.manual_processing','withdrawal_requests',p_id,jsonb_build_object('reason',p_reason));
 return true;
end $$;
revoke all on function public.staff_start_manual_payout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_start_manual_payout(uuid,uuid,text) to service_role;

-- Separate proof prevents staff from marking two payments paid with the same reference.
create table if not exists public.manual_payout_confirmations(
 withdrawal_id uuid primary key references public.withdrawal_requests(id),
 provider text not null,
 external_reference text not null,
 confirmed_by uuid not null references auth.users(id),
 confirmation_note text not null check(length(trim(confirmation_note))>=15),
 confirmed_at timestamptz not null default now(),
 unique(provider,external_reference)
);
alter table public.manual_payout_confirmations enable row level security;
revoke all on public.manual_payout_confirmations from public,anon,authenticated;

create or replace function public.staff_confirm_manual_payout(
 p_id uuid,p_actor uuid,p_reference text,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.withdrawal_requests%rowtype;
begin
 if length(trim(coalesce(p_reference,'')))<6 or length(trim(coalesce(p_reason,'')))<15 then
   raise exception 'External transfer reference and detailed confirmation note required';end if;
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then raise exception 'Administrator required';end if;
 if not exists(select 1 from public.system_settings where key='payout_mode' and value='"manual"'::jsonb) then
   raise exception 'Manual payout mode disabled';end if;
 select * into r from public.withdrawal_requests where id=p_id for update;
 if not found then raise exception 'Withdrawal not found';end if;
 if r.status='paid' then return false;end if;
 if r.status<>'processing' then raise exception 'Payment must be processing';end if;
 insert into public.manual_payout_confirmations(withdrawal_id,provider,external_reference,confirmed_by,confirmation_note)
 values(p_id,r.provider,trim(p_reference),p_actor,trim(p_reason));
 update public.wallet_accounts set reserved_pence=reserved_pence-r.requested_pence,
   liability_ledger_version=liability_ledger_version+1
 where user_id=r.user_id and reserved_pence>=r.requested_pence;
 if not found then raise exception 'Reserved funds do not match the withdrawal';end if;
 update public.withdrawal_requests
 set status='paid',provider_reference=trim(p_reference),resolved_at=now(),approved_by=coalesce(approved_by,p_actor)
 where id=p_id;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason,created_by)
 values(r.user_id,-r.requested_pence,'payout_settled','withdrawal',p_id,'settled',
        'settlement-'||p_id::text,'Staff-confirmed off-platform transfer: '||trim(p_reference),p_actor);
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_filtered)
 values(p_actor,'payout.manual_paid','withdrawal_requests',p_id,
        jsonb_build_object('reference',p_reference,'note',p_reason,'confirmed_externally',true));
 insert into public.notifications(user_id,title,body,type,deep_link)
 values(r.user_id,'Withdrawal marked paid',
        'Our team recorded your manual transfer as paid. Reference: '||trim(p_reference),
        'success','/app/wallet');
 return true;
end $$;
revoke all on function public.staff_confirm_manual_payout(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.staff_confirm_manual_payout(uuid,uuid,text,text) to service_role;
