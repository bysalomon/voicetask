alter table public.support_tickets add constraint support_tickets_valid_status check(status in ('open','pending','closed'));
create policy "admin support ticket update" on public.support_tickets for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant update(status,admin_assignee) on public.support_tickets to authenticated;
create policy "member or admin support messages" on public.support_messages for insert to authenticated with check(
 sender_id=auth.uid() and exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.owner_id=auth.uid() or public.is_admin()))
);
-- Remove redundant earlier broad support message insert policy, retaining owner/admin enforcement.
drop policy if exists "admin support" on public.support_messages;
create or replace function public.notify_support_reply() returns trigger language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 select owner_id into v_owner from public.support_tickets where id=new.ticket_id;
 if v_owner is not null and new.sender_id<>v_owner then
  insert into public.notifications(user_id,title,body,type,deep_link) values(v_owner,'Support replied','Your VoiceTask support ticket has a new response.','information','/app/support');
 end if;
 return new;
end $$;
create trigger support_reply_notification after insert on public.support_messages for each row execute function public.notify_support_reply();
