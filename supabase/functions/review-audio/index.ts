import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';import {validate} from '../_shared/audio.ts';
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await admin(req);
 const b=await req.json();if(typeof b.submission_id!=='string'||!['inspect','analyse'].includes(b.action))throw Error('Valid review request required');
 const {data:submission,error:se}=await service.from('task_submissions').select('id,assignment_id,status,user_id').eq('id',b.submission_id).single();
 if(se||!submission)throw Error('Submission unavailable');
 const {data:assignment}=await service.from('user_task_assignments').select('task_id').eq('id',submission.assignment_id).single();
 if(!assignment)throw Error('Assignment unavailable');
 const [filesResponse,phrasesResponse]=await Promise.all([
  service.from('recording_files').select('id,phrase_id,path,mime_type,byte_size,quality_state,checksum_sha256,duration_ms,voice_seconds_ms').eq('submission_id',submission.id),
  service.from('task_phrases').select('id,position,expected_text').eq('task_id',assignment.task_id).order('position')
 ]);
 if(filesResponse.error||phrasesResponse.error)throw Error('Review data could not be loaded');
 const files=filesResponse.data||[];const phrases=phrasesResponse.data||[];
 const qualityResponse=await service.from('audio_quality_results').select('recording_id,checks,final_decision').in('recording_id',files.map(f=>f.id));
 if(qualityResponse.error)throw qualityResponse.error;
 if(files.length!==phrases.length||!phrases.length)throw Error('Incomplete phrase recordings');
 if(b.action==='inspect'){
  await service.from('audit_logs').insert({actor_user_id:user.id,action:'audio.review_started',entity_type:'task_submissions',entity_id:submission.id});
  const entries=[];
  for(const phrase of phrases){
   const file=files.find(f=>f.phrase_id===phrase.id);if(!file)throw Error('Missing phrase recording');
   const {data:signed,error}=await service.storage.from('voice-recordings').createSignedUrl(file.path,120);
   if(error)throw error;
   entries.push({id:file.id,position:phrase.position,text:phrase.expected_text,url:signed.signedUrl,quality_state:file.quality_state,duration_ms:file.duration_ms,voice_seconds_ms:file.voice_seconds_ms,quality:qualityResponse.data?.find(v=>v.recording_id===file.id)||null});
  }
  return reply({submission_id:submission.id,status:submission.status,recordings:entries,expires_seconds:120});
 }
 if(!['submitted','manual_review','quality_review'].includes(submission.status))throw Error('Submission is not reviewable');
 const output=[];
 for(const phrase of phrases){
  const file=files.find(f=>f.phrase_id===phrase.id);if(!file)throw Error('Missing recording');
  try{
   const validated=await validate(file,phrase.expected_text);
   const result=await service.from('recording_files').update({quality_state:'passed',checksum_sha256:validated.checksum,duration_ms:validated.duration,voice_seconds_ms:validated.spoken}).eq('id',file.id);
   if(result.error)throw result.error;
   const audit=await service.from('audio_quality_results').upsert({recording_id:file.id,checks:validated.checks,validator_version:'deepgram-nova-3-v1',final_decision:'passed',score:Math.round(validated.similarity*100)},{onConflict:'recording_id'});
   if(audit.error)throw audit.error;
   output.push({position:phrase.position,status:'passed'});
  }catch(err){
   const reason=err instanceof Error?err.message:'Quality review failed';
   await service.from('recording_files').update({quality_state:'manual_review'}).eq('id',file.id);
   await service.from('audio_quality_results').upsert({recording_id:file.id,checks:{error:reason},validator_version:'deepgram-nova-3-v1',final_decision:'manual_review'},{onConflict:'recording_id'});
   output.push({position:phrase.position,status:'manual_review',reason});
  }
 }
 await service.from('task_submissions').update({status:'manual_review',review_reason:'Awaiting human verification of the requested emotional tone.'}).eq('id',submission.id);
 await service.from('audit_logs').insert({actor_user_id:user.id,action:'audio.quality_analysed',entity_type:'task_submissions',entity_id:submission.id,after_filtered:{results:output}});
 return reply({status:'manual_review',results:output,message:output.every(result=>result.status==='passed')?'Automatic checks passed; a genuine human tone review is still required before approval.':'Automatic validation could not pass every recording. Check the recorded error details; no wallet reward has been credited.'});
}catch(e){return fail(e)}});
