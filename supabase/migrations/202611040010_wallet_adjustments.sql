-- Administrator wallet corrections are ledger-backed; large movements require a second admin.
create table public.wallet_adjustment_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 amount_pence bigint not null check(amount_pence<>0 and abs(amount_pence)<=10000000),
 currency text not null default 'GBP' check(currency='GBP'),
 reason text not null check(length(trim(reason))>=15),
 requested_by uuid not null references auth.users(id),
 confirmed_by uuid references auth.users(id),
 status text not null default 'pending' check(status in('pending','applied','rejected')),
 created_at timestamptz not null default now(),
 decided_at timestamptz
);
alter table public.wallet_adjustment_requests enable row level security;
create policy "admin wallet requests" on public.wallet_adjustment_requests for select to authenticated using(public.is_admin());
revoke insert,update,delete on public.wallet_adjustment_requests from anon,authenticated;
create or replace function public.post_wallet_event() returns trigger language plpgsql security definer set search_path='' as $$
declare a text;b text;v_amount bigint;
begin
 if new.effect_type in('credit','adjustment_credit') then a:='platform_expense';b:='member_available_liability';
 elsif new.effect_type in('adjustment_debit') then a:='member_available_liability';b:='platform_expense';
 elsif new.effect_type='reserve' then a:='member_available_liability';b:='member_reserved_liability';
 elsif new.effect_type='release' then a:='member_reserved_liability';b:='member_available_liability';
 elsif new.effect_type='settled' then a:='member_reserved_liability';b:='platform_cash';
 else raise exception 'Unsupported wallet effect';end if;
 v_amount:=abs(new.amount_pence);
 insert into public.wallet_journal_postings(journal_id,user_id,account,amount_pence)
 values(new.id,new.user_id,a,v_amount),(new.id,new.user_id,b,-v_amount);
 return new;
end $$;
create or replace function public.apply_wallet_adjustment_secure(p_request uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.wallet_adjustment_requests%rowtype;
begin
 select * into r from public.wallet_adjustment_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'Adjustment is not pending';end if;
 if abs(r.amount_pence)>10000 and r.requested_by=p_actor then raise exception 'Second administrator approval required';end if;
 update public.wallet_accounts set available_pence=available_pence+r.amount_pence,liability_ledger_version=liability_ledger_version+1 where user_id=r.user_id and available_pence+r.amount_pence>=0;
 if not found then raise exception 'Adjustment would make available balance negative';end if;
 insert into public.wallet_ledger_entries(user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason,created_by)
 values(r.user_id,r.amount_pence,'admin_adjustment','wallet_adjustment',r.id,case when r.amount_pence>0 then 'adjustment_credit' else 'adjustment_debit' end,'wallet-adjustment-'||r.id::text,r.reason,p_actor);
 update public.wallet_adjustment_requests set status='applied',confirmed_by=p_actor,decided_at=now() where id=r.id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_filtered) values(p_actor,'wallet.adjustment.applied','wallet_adjustment_requests',r.id,jsonb_build_object('amount_pence',r.amount_pence,'user_id',r.user_id,'reason',r.reason));
 insert into public.notifications(user_id,title,body,type,deep_link) values(r.user_id,'Wallet adjustment','An audited balance adjustment has been applied to your account.','information','/app/wallet');
 return true;
end $$;
create or replace function public.propose_wallet_adjustment_secure(p_user uuid,p_amount_pence bigint,p_actor uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_amount_pence=0 or abs(p_amount_pence)>10000000 or length(trim(coalesce(p_reason,'')))<15 then raise exception 'Invalid wallet correction';end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Unknown member';end if;
 insert into public.wallet_adjustment_requests(user_id,amount_pence,reason,requested_by) values(p_user,p_amount_pence,p_reason,p_actor) returning id into v_id;
 if abs(p_amount_pence)<=10000 then perform public.apply_wallet_adjustment_secure(v_id,p_actor);end if;
 return v_id;
end $$;
revoke all on function public.apply_wallet_adjustment_secure(uuid,uuid),public.propose_wallet_adjustment_secure(uuid,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_wallet_adjustment_secure(uuid,uuid),public.propose_wallet_adjustment_secure(uuid,bigint,uuid,text) to service_role;
