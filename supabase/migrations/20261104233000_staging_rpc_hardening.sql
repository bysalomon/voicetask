-- VoiceTask staging database security hardening.
-- Previously applied to voicetask-staging using managed Supabase on 2026-11-04.
-- Idempotent grants keep future environments aligned with the tested permission model.

revoke execute on function public.allocate_my_tasks() from public, anon, authenticated;
grant execute on function public.allocate_my_tasks() to authenticated;

revoke execute on function public.community_leaderboard(text) from public, anon, authenticated;
grant execute on function public.community_leaderboard(text) to authenticated;

revoke execute on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.next_broadcasts_for_session() from public, anon, authenticated;
grant execute on function public.next_broadcasts_for_session() to authenticated;

revoke execute on function public.request_my_withdrawal(bigint,uuid,uuid) from public, anon, authenticated;
grant execute on function public.request_my_withdrawal(bigint,uuid,uuid) to authenticated;

revoke execute on function public.submit_my_task(uuid,uuid) from public, anon, authenticated;
grant execute on function public.submit_my_task(uuid,uuid) to authenticated;

revoke execute on function public.init_member() from public, anon, authenticated;
revoke execute on function public.post_wallet_event() from public, anon, authenticated;
revoke execute on function public.prevent_published_task_edit() from public, anon, authenticated;
revoke execute on function public.prevent_published_phrase_edit() from public, anon, authenticated;

alter function public.prevent_published_task_edit() set search_path = '';
alter function public.prevent_published_phrase_edit() set search_path = '';
