-- Support notification is a database trigger, not a callable public API.
-- Trigger execution remains valid; direct Data API execution is forbidden.
revoke execute on function public.notify_support_reply() from public, anon, authenticated;
