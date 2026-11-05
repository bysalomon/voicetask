import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';
Deno.serve(async req=>{
 try{
  const pre=cors(req);if(pre)return pre;requirePost(req);
  const user=await admin(req);const b=await req.json();
  if(typeof b.submission_id!=='string'||b.action!=='inspect')throw Error('Only private recording inspection is supported; quality analysis is not performed');
  const {data:submission,error:se}=await service.from('task_submissions')
    .select('id,assignment_id,status').eq('id',b.submission_id).single();
  if(se||!submission)throw Error('Submission unavailable');
  const {data:assignment}=await service.from('user_task_assignments')
    .select('task_id').eq('id',submission.assignment_id).single();
  if(!assignment)throw Error('Assignment unavailable');
  const [files,phrases]=await Promise.all([
    service.from('recording_files').select('id,phrase_id,path').eq('submission_id',submission.id),
    service.from('task_phrases').select('id,position,expected_text')
      .eq('task_id',assignment.task_id).order('position')
  ]);
  if(files.error||phrases.error)throw Error('Review files unavailable');
  const items=[];
  for(const phrase of phrases.data||[]){
    const file=files.data?.find(f=>f.phrase_id===phrase.id);
    if(!file)throw Error('Recording for a phrase is unavailable');
    const {data:link,error}=await service.storage.from('voice-recordings').createSignedUrl(file.path,120);
    if(error)throw error;
    items.push({id:file.id,position:phrase.position,text:phrase.expected_text,url:link.signedUrl});
  }
  await service.from('audit_logs').insert({actor_user_id:user.id,action:'audio.private_playback',
    entity_type:'task_submissions',entity_id:submission.id});
  return reply({submission_id:submission.id,status:submission.status,recordings:items,expires_seconds:120,quality_checked:false});
 }catch(e){return fail(e)}
});
