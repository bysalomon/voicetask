-- Visiting /invitation grants a registration opportunity, without an extra code.
-- Backend creates a per-attempt single-use invitation to keep an audit trail.
-- Staging-only global limits; add bot challenge before unrestricted public launch.
create table if not exists public.page_invitation_attempts(
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check(email_hash ~ '^[0-9a-f]{64}$'),
  token_id uuid not null unique references public.invitation_tokens(id),
  created_at timestamptz not null default now()
);
create index if not exists page_invitation_attempts_email_time
  on public.page_invitation_attempts(email_hash,created_at desc);
create index if not exists page_invitation_attempts_created
  on public.page_invitation_attempts(created_at desc);
alter table public.page_invitation_attempts enable row level security;
revoke all on public.page_invitation_attempts from public,anon,authenticated;

create or replace function public.reserve_page_invitation(p_email_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_token uuid;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid registration request';
  end if;
  -- Serialize allocations to prevent competing requests bypassing the limits.
  perform pg_advisory_xact_lock(hashtextextended('voicetask:page-invitation',0));
  if (select count(*) from public.page_invitation_attempts
      where created_at > now()-interval '1 hour') >= 20
    or (select count(*) from public.page_invitation_attempts
        where email_hash=p_email_hash and created_at > now()-interval '24 hours') >= 3
  then
    raise exception 'Registration temporarily limited. Please try again later';
  end if;
  insert into public.invitation_tokens(token_hash,issued_by_user,expires_at,max_uses,uses)
  values (
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
    null,now()+interval '15 minutes',1,1
  ) returning id into v_token;
  insert into public.page_invitation_attempts(email_hash,token_id)
  values(p_email_hash,v_token);
  return v_token;
end $$;
revoke all on function public.reserve_page_invitation(text) from public,anon,authenticated;
grant execute on function public.reserve_page_invitation(text) to service_role;
