-- Audit-ready journal postings and provider-confirmed settlements.
create table public.wallet_journal_postings(
 id uuid primary key default gen_random_uuid(),
 journal_id uuid not null,
 user_id uuid not null references auth.users(id),
 account text not null check(account in ('platform_expense','member_available_liability','member_reserved_liability','platform_cash')),
 amount_pence bigint not null check(amount_pence<>0),
 currency text not null default 'GBP' check(currency='GBP'),
 created_at timestamptz not null default now(),
 unique(journal_id,account)
);
create index on public.wallet_journal_postings(user_id,created_at);
alter table public.wallet_journal_postings enable row level security;
create policy "journal admin visibility" on public.wallet_journal_postings for select to authenticated using(public.is_admin());
create policy "journal own visibility" on public.wallet_journal_postings for select to authenticated using(user_id=auth.uid() and account in('member_available_liability','member_reserved_liability'));
revoke insert,update,delete on public.wallet_journal_postings from authenticated,anon;
create or replace function public.post_wallet_event() returns trigger language plpgsql security definer set search_path='' as $$
declare left_account text;right_account text;
begin
 if new.effect_type='credit' then
  left_account:='platform_expense';right_account:='member_available_liability';
 elsif new.effect_type='reserve' then
  left_account:='member_available_liability';right_account:='member_reserved_liability';
 elsif new.effect_type='release' then
  left_account:='member_reserved_liability';right_account:='member_available_liability';
 elsif new.effect_type='settled' then
  left_account:='member_reserved_liability';right_account:='platform_cash';
 else
  raise exception 'Unsupported wallet effect type %',new.effect_type;
 end if;
 insert into public.wallet_journal_postings(journal_id,user_id,account,amount_pence)
 values(new.id,new.user_id,left_account,abs(new.amount_pence)),(new.id,new.user_id,right_account,-abs(new.amount_pence));
 return new;
end $$;
create trigger on_wallet_event after insert on public.wallet_ledger_entries for each row execute function public.post_wallet_event();
create table public.payout_webhook_events(
 provider_event_id text primary key,
 withdrawal_id uuid references public.withdrawal_requests(id),
 event_type text not null,
 processed_at timestamptz not null default now(),
 details jsonb
);
alter table public.payout_webhook_events enable row level security;
create policy "admin payout events" on public.payout_webhook_events for select to authenticated using(public.is_admin());
revoke insert,update,delete on public.payout_webhook_events from authenticated,anon;
create or replace function public.settle_paid_withdrawal_secure(p_id uuid,p_reference text,p_event_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.withdrawal_requests%rowtype;
begin
 if nullif(trim(p_reference),'') is null or nullif(trim(p_event_id),'') is null then raise exception 'Provider proof required';end if;
 select * into r from public.withdrawal_requests where id=p_id for update;
 if not found then raise exception 'Withdrawal not found';end if;
 if r.status='paid' then return false;end if;
 if r.status<>'processing' then raise exception 'Not processing';end if;
 insert into public.payout_webhook_events(provider_event_id,withdrawal_id,event_type) values(p_event_id,p_id,'payout_confirmed') on conflict do nothing;
 if not found then return false;end if;
 update public.wallet_accounts set reserved_pence=reserved_pence-r.requested_pence,liability_ledger_version=liability_ledger_version+1 where user_id=r.user_id and reserved_pence>=r.requested_pence;
 if not found then raise exception 'Reserved fund mismatch';end if;
 update public.withdrawal_requests set status='paid',provider_reference=p_reference,resolved_at=now() where id=p_id;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason)
 values(r.user_id,-r.requested_pence,'payout_settled','withdrawal',r.id,'settled','settlement-'||r.id::text,'Confirmed by payout provider');
 insert into public.notifications(user_id,title,body,type,deep_link) values(r.user_id,'Withdrawal paid','Your provider has confirmed the payout.','success','/app/wallet');
 return true;
end $$;
revoke all on function public.settle_paid_withdrawal_secure(uuid,text,text) from public,anon,authenticated;
grant execute on function public.settle_paid_withdrawal_secure(uuid,text,text) to service_role;
-- Published payout destinations can only be created/marked verified via trusted provider workflow.
