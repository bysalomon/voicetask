import {service,reply,fail} from '../_shared/server.ts';import {validate} from '../_shared/audio.ts';
// Background worker: verifies real bytes, duration and ASR only when provider is configured.
// It never approves earnings or identity based on elapsed time.
Deno.serve(async req=>{try{
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const secret=Deno.env.get('CRON_SECRET');
 if(!secret||req.headers.get('Authorization')!=='Bearer '+secret)return reply({error:'Unauthorised'},401);
 const started=new Date().toISOString();
 const {data:items,error}=await service.from('task_submissions').select('id,assignment_id').eq('status','submitted').lte('review_due_at',started).limit(20);
 if(error)throw error;
 let reviewed=0,awaiting=0;
 for(const submission of items||[]){
  const {data:assigned}=await service.from('user_task_assignments').select('task_id').eq('id',submission.assignment_id).single();
  if(!assigned){awaiting++;continue}
  const [filesResult,phrasesResult]=await Promise.all([
   service.from('recording_files').select('id,phrase_id,path,mime_type,byte_size').eq('submission_id',submission.id),
   service.from('task_phrases').select('id,expected_text').eq('task_id',assigned.task_id)]);
  const files=filesResult.data||[],phrases=phrasesResult.data||[];
  if(!files.length||files.length!==phrases.length){await service.from('task_submissions').update({status:'manual_review',review_reason:'Missing or incomplete audio uploads'}).eq('id',submission.id);awaiting++;continue}
  let pass=0;
  for(const phrase of phrases){
   const file=files.find(r=>r.phrase_id===phrase.id);
   if(!file)continue;
   try{
    const v=await validate(file,phrase.expected_text);
    const saved=await service.from('recording_files').update({quality_state:'passed',checksum_sha256:v.checksum,duration_ms:v.duration,voice_seconds_ms:v.spoken}).eq('id',file.id);
    if(saved.error)throw saved.error;
    const quality=await service.from('audio_quality_results').upsert({recording_id:file.id,checks:v.checks,validator_version:'deepgram-nova-3-v1',final_decision:'passed',score:Math.round(v.similarity*100)},{onConflict:'recording_id'});
    if(quality.error)throw quality.error;pass++;
   }catch(e){
    await service.from('recording_files').update({quality_state:'manual_review'}).eq('id',file.id);
    await service.from('audio_quality_results').upsert({recording_id:file.id,checks:{error:e instanceof Error?e.message:'Validation unavailable'},validator_version:'deepgram-nova-3-v1',final_decision:'manual_review'},{onConflict:'recording_id'});
   }
  }
  await service.from('task_submissions').update({status:'manual_review',review_reason:pass===phrases.length?'Content validated; awaiting human tone verification.':'Audio quality needs manual review.'}).eq('id',submission.id).eq('status','submitted');
  await service.from('notifications').insert({user_id:(await service.from('task_submissions').select('user_id').eq('id',submission.id).single()).data?.user_id,title:'Recordings under review',body:'Your recordings are being assessed. We will notify you when there is a verified decision.',deep_link:'/app/tasks'});
  reviewed++;
 }
 const {data:overdue}=await service.from('identity_verifications').select('id').in('status',['submitted','processing','manual_review']).lte('due_at',started).limit(100);
 await service.from('cron_job_runs').insert({job_name:'scheduled-maintenance',status:'completed',finished_at:new Date().toISOString()});
 return reply({reviewed,awaiting,overdue_kyc:overdue?.length||0,message:'No recording or identity auto-approved by elapsed time.'});
}catch(e){return fail(e)}});
