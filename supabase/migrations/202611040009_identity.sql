-- Identity decisions and audit trail are atomic and limited to a reviewed genuine document.
create unique index if not exists identity_one_active_per_member
on public.identity_verifications(user_id)
where status in('submitted','processing','manual_review','verified');
create policy "member identity events" on public.identity_status_events
for select to authenticated using (
 exists (select 1 from public.identity_verifications v where v.id=verification_id and v.user_id=auth.uid())
);
create or replace function public.decide_identity_secure(p_id uuid,p_actor uuid,p_approved boolean,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v public.identity_verifications%rowtype;v_status text;
begin
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'An auditable identity decision reason is required';end if;
 select * into v from public.identity_verifications where id=p_id for update;
 if not found or v.status not in('submitted','processing','manual_review') then raise exception 'Identity verification cannot be reviewed';end if;
 if p_approved then
  if not exists(select 1 from public.identity_documents where verification_id=v.id) then raise exception 'Document evidence is missing';end if;
  if not exists(select 1 from public.verification_access_logs where verification_id=v.id and actor=p_actor and action='document.review' and created_at>now()-interval '30 minutes') then raise exception 'Administrator must inspect submitted documents before approval';end if;
 end if;
 v_status:=case when p_approved then 'verified' else 'rejected' end;
 update public.identity_verifications set status=v_status,reviewer=p_actor,decision_reason=p_reason,resolved_at=now() where id=v.id;
 insert into public.identity_status_events(verification_id,from_status,to_status,source,actor,reason)
 values(v.id,v.status,v_status,'manual_document_inspection',p_actor,p_reason);
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_filtered)
 values(p_actor,'identity.'||v_status,'identity_verifications',v.id,jsonb_build_object('rationale',p_reason,'previous_status',v.status));
 insert into public.notifications(user_id,title,body,type,deep_link)
 values(v.user_id,case when p_approved then 'Identity verified' else 'Identity verification declined' end,
 case when p_approved then 'Your identity documents have been reviewed and approved.' else 'Your verification needs attention. Reason: '||p_reason end,
 case when p_approved then 'success' else 'warning' end,'/app/profile#identity-verification');
 return true;
end $$;
revoke all on function public.decide_identity_secure(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.decide_identity_secure(uuid,uuid,boolean,text) to service_role;
