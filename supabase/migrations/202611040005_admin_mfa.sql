create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin')$$;
revoke all on function public.is_admin() from public;grant execute on function public.is_admin() to authenticated;
