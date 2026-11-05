import {service,reply,fail} from '../_shared/server.ts';
// Optional authenticated maintenance endpoint. The in-database pg_cron schedule
// independently runs the same idempotent acceptance function every minute.
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return reply({error:'POST required'},405);
  const secret=Deno.env.get('CRON_SECRET');
  if(!secret||req.headers.get('Authorization')!=='Bearer '+secret)return reply({error:'Unauthorised'},401);
  const {data,error}=await service.rpc('auto_accept_due_submissions',{p_limit:50});
  if(error)throw error;
  await service.from('cron_job_runs').insert({job_name:'scheduled-maintenance',
    status:'completed',finished_at:new Date().toISOString()});
  return reply({accepted:Number(data)||0,policy:'time-acceptance-v1',speech_quality_checked:false,
    message:'Only completed uploaded tasks past five minutes were accepted; no audio quality was verified.'});
 }catch(e){return fail(e)}
});
