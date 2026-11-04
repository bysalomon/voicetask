-- A genuine once-per-auth-session broadcast selector; no front-end countdown or timers required.
drop policy if exists "active broadcasts" on public.broadcasts;
create policy "active public broadcasts" on public.broadcasts for select to authenticated using((status='published' and starts_at<=now() and ends_at>now() and (audience_filter->>'kind')='all') or public.is_admin());
create or replace function public.next_broadcasts_for_session() returns table(id uuid,title text,body text,type text) language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_session uuid;v_row record;
begin
 if v_user is null then raise exception 'Unauthenticated';end if;
 v_session:=nullif(auth.jwt()->>'session_id','')::uuid;
 if v_session is null then return;end if;
 for v_row in select b.id,b.title,b.body,b.type from public.broadcasts b where b.status='published' and b.starts_at<=now() and b.ends_at>now() and b.audience_filter->>'kind'='all' order by b.starts_at,b.id loop
  insert into public.broadcast_impressions(broadcast_id,user_id,auth_session_identifier) values(v_row.id,v_user,v_session) on conflict do nothing;
  if found then id:=v_row.id;title:=v_row.title;body:=v_row.body;type:=v_row.type;return next;end if;
 end loop;
end $$;
revoke all on function public.next_broadcasts_for_session() from public;grant execute on function public.next_broadcasts_for_session() to authenticated;
-- Remove direct browser writes for the once-per-session table.
drop policy if exists "my impressions insert" on public.broadcast_impressions;
