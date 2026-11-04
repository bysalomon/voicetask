import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';
type File={id:string;phrase_id:string;path:string;mime_type:string;byte_size:number};
function normal(value:string){return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean)}
function alignment(expected:string,actual:string){const a=normal(expected),b=normal(actual);if(!a.length||!b.length)return 0;const matrix=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return Math.max(0,1-matrix[a.length][b.length]/Math.max(a.length,b.length))}
function magic(bytes:Uint8Array,mime:string){const webm=bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;const ogg=bytes[0]===79&&bytes[1]===103&&bytes[2]===103&&bytes[3]===83;const mp4=bytes[4]===102&&bytes[5]===116&&bytes[6]===121&&bytes[7]===112;return mime.includes('webm')?webm:mime.includes('ogg')?ogg:mime.includes('mp4')?mp4:false}
async function validate(file:File,expected:string){
 const {data,error}=await service.storage.from('voice-recordings').download(file.path);
 if(error||!data)throw Error('Stored recording could not be read');
 const bytes=new Uint8Array(await data.arrayBuffer());
 const checks:{[key:string]:unknown}={actual_byte_size:bytes.length,mime_type:file.mime_type,magic_valid:magic(bytes,file.mime_type),expected_text:expected};
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==file.byte_size||bytes.length<100||bytes.length>26214400||!checks.magic_valid)throw Error('Recording integrity mismatch');
 const token=Deno.env.get('DEEPGRAM_API_KEY');if(!token)throw Error('ASR provider not configured; recordings cannot be approved yet');
 const res=await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=en-GB&smart_format=true',{method:'POST',headers:{Authorization:'Token '+token,'Content-Type':file.mime_type},body:bytes});
 if(!res.ok)throw Error('ASR provider rejected audio ('+res.status+')');
 const d=await res.json();
 const alternative=d.results?.channels?.[0]?.alternatives?.[0];const transcript=String(alternative?.transcript||'');
 const providerDuration=Math.round(Number(d.metadata?.duration||0)*1000);
 const words:Array<{start:number;end:number;confidence:number}>=alternative?.words||[];
 const spoken=Math.round(words.reduce((sum,w)=>sum+Math.max(0,(w.end-w.start)*1000),0));
 const similarity=alignment(expected,transcript);
 const confidence=words.length?words.reduce((sum,w)=>sum+Number(w.confidence||0),0)/words.length:0;
 Object.assign(checks,{transcript,similarity,confidence,word_count:words.length,provider_duration_ms:providerDuration,voice_ms:spoken});
 if(providerDuration<750||spoken<650||spoken>providerDuration||similarity<.78||confidence<.65)throw Error('Speech quality criteria were not met');
 return {checks,checksum:digest,duration:providerDuration,spoken,similarity};
}
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await admin(req);
 const b=await req.json();if(typeof b.submission_id!=='string'||!['inspect','analyse'].includes(b.action))throw Error('Valid review request required');
 const {data:submission,error:se}=await service.from('task_submissions').select('id,assignment_id,status,user_id').eq('id',b.submission_id).single();
 if(se||!submission)throw Error('Submission unavailable');
 const {data:assignment}=await service.from('user_task_assignments').select('task_id').eq('id',submission.assignment_id).single();
 if(!assignment)throw Error('Assignment unavailable');
 const [filesResponse,phrasesResponse,qualityResponse]=await Promise.all([
  service.from('recording_files').select('id,phrase_id,path,mime_type,byte_size,quality_state,checksum_sha256,duration_ms,voice_seconds_ms').eq('submission_id',submission.id),
  service.from('task_phrases').select('id,position,expected_text').eq('task_id',assignment.task_id).order('position'),
  service.from('audio_quality_results').select('recording_id,checks,final_decision')
 ]);
 if(filesResponse.error||phrasesResponse.error||qualityResponse.error)throw Error('Review data could not be loaded');
 const files=filesResponse.data||[];const phrases=phrasesResponse.data||[];
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
 return reply({status:'manual_review',results:output,message:'Content and duration verified where possible; manual tone review is still required.'});
}catch(e){return fail(e)}});
