create or replace function public.submit_my_task(p_assignment_id uuid,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_ass public.user_task_assignments%rowtype;v_phrases integer;v_drafts integer;v_id uuid;
begin
 if v_user is null then raise exception 'Unauthenticated';end if;
 if not exists(select 1 from public.profiles where id=v_user and status='active') then raise exception 'Account is not active';end if;
 select * into v_ass from public.user_task_assignments where id=p_assignment_id and user_id=v_user for update;
 if not found then raise exception 'Assignment not found';end if;
 if v_ass.status not in ('assigned','in_progress','needs_rerecord') then raise exception 'Assignment cannot be submitted';end if;
 select count(*) into v_phrases from public.task_phrases where task_id=v_ass.task_id;
 select count(*) into v_drafts from public.recording_drafts d join public.task_phrases p on p.id=d.phrase_id where d.assignment_id=v_ass.id and d.user_id=v_user and p.task_id=v_ass.task_id;
 if v_phrases<1 or v_phrases>70 or v_drafts<>v_phrases then raise exception 'All phrases require a saved recording';end if;
 insert into public.task_submissions(assignment_id,user_id,idempotency_key) values(p_assignment_id,v_user,p_idempotency_key) returning id into v_id;
 insert into public.recording_files(submission_id,phrase_id,path,mime_type,byte_size) select v_id,phrase_id,storage_path,mime_type,byte_size from public.recording_drafts where assignment_id=p_assignment_id;
 update public.user_task_assignments set status='submitted' where id=p_assignment_id;
 return v_id;
end $$;

revoke all on function public.submit_my_task(uuid,uuid) from public;grant execute on function public.submit_my_task(uuid,uuid) to authenticated;
