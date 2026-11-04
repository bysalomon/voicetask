import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await admin(req);const b=await req.json();
 if(typeof b.task_id!=='string'||!/^[0-9a-f-]{36}$/i.test(b.task_id))throw Error('Valid task ID required');
 const {data:task,error:taskError}=await service.from('tasks').select('*').eq('id',b.task_id).single();
 if(taskError||!task)throw Error('Task not found');
 if(!['pause','publish','archive','clone'].includes(b.action))throw Error('Unsupported task operation');
 let resultId=task.id;
 if(b.action==='clone'){
  const {data:phrases,error:phrasesError}=await service.from('task_phrases').select('position,expected_text,duration_min_seconds,duration_max_seconds').eq('task_id',task.id).order('position');
  if(phrasesError||!phrases?.length)throw Error('Cannot clone task without phrases');
  const {data:newTask,error:createError}=await service.from('tasks').insert({
   title:task.title+' (copy)',description:task.description,category:task.category,reward_pence:task.reward_pence,
   status:'draft',version:task.version+1,language:task.language,instructions:task.instructions,
   estimated_minutes:task.estimated_minutes,created_by:user.id
  }).select('id').single();
  if(createError||!newTask)throw createError||Error('Could not clone task');
  const created=await service.from('task_phrases').insert(phrases.map(p=>({...p,task_id:newTask.id})));
  if(created.error){await service.from('tasks').delete().eq('id',newTask.id);throw created.error}
  resultId=newTask.id;
 }else{
  const target=b.action==='pause'?'paused':b.action==='archive'?'archived':'published';
  if(b.action==='pause'&&task.status!=='published')throw Error('Only published tasks can be paused');
  if(b.action==='publish'&&!['draft','paused'].includes(task.status))throw Error('Task cannot be published from this status');
  if(b.action==='archive'&&task.status==='archived')throw Error('Task already archived');
  if(target==='published'){
   const {count,error}=await service.from('task_phrases').select('id',{head:true,count:'exact'}).eq('task_id',task.id);
   if(error||!count||count>70)throw Error('Published task must contain 1–70 phrases');
  }
  const changed=await service.from('tasks').update({status:target,published_at:target==='published'?(task.published_at||new Date().toISOString()):task.published_at}).eq('id',task.id);
  if(changed.error)throw changed.error;
 }
 await service.from('audit_logs').insert({actor_user_id:user.id,action:'task.'+b.action,entity_type:'tasks',entity_id:resultId,after_filtered:{source_id:task.id,previous_status:task.status}});
 return reply({id:resultId,message:b.action==='clone'?'Editable task copy created as draft.':'Task '+b.action+' successful.'});
}catch(e){return fail(e)}});
