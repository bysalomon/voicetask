import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL||process.env.API_URL;
const anon=process.env.SUPABASE_ANON_KEY||process.env.ANON_KEY;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SERVICE_ROLE_KEY;
if(!url||!anon||!key)throw Error('Local Supabase API_URL, ANON_KEY and SERVICE_ROLE_KEY required');
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,key,opts);
const suffix=crypto.randomUUID().slice(0,12);
const password='Test-VoiceTask-'+suffix+'-Aa!8';
const ids=[];
let a,b,claims=[];
async function createUser(which){
 const email=`integration-${which}-${suffix}@example.test`;
 const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Integration '+which,country:'GB'}});
 assert.ifError(error); assert.ok(data.user);
 ids.push(data.user.id);
 const client=createClient(url,anon,opts);
 const login=await client.auth.signInWithPassword({email,password});
 assert.ifError(login.error);
 return {client,user:data.user};
}
test('isolated Supabase: actual multi-account authorization and entitlement workflow',async()=>{
 a=await createUser('a');b=await createUser('b');
 const roles=await a.client.from('user_roles').insert({user_id:a.user.id,role:'admin'});
 assert.ok(roles.error,'Client must not grant itself admin permissions');
 const admin=await a.client.rpc('is_admin');assert.equal(admin.data,false);
 const profile=await a.client.from('profiles').select('id').eq('id',b.user.id);
 assert.equal(profile.data?.length,0,'Member A cannot read member B profile');
 const wallet=await a.client.from('wallet_accounts').select('user_id').eq('user_id',b.user.id);
 assert.equal(wallet.data?.length,0,'Member A cannot read member B wallet');
 const change=await a.client.from('profiles').update({status:'active'}).eq('id',a.user.id);
 assert.ok(change.error,'Status is read-only for ordinary members');
 const inject=await a.client.from('wallet_ledger_entries').insert({user_id:a.user.id,amount_pence:100000,entry_type:'task_reward',source_type:'task_submission',source_id:crypto.randomUUID(),effect_type:'credit',idempotency_key:crypto.randomUUID()});
 assert.ok(inject.error,'Client cannot directly create money');
 for(let i=0;i<5;i++){
  const {data:task,error}=await service.from('tasks').insert({title:'Integration task '+i,category:'Crying Voice',reward_pence:500,status:'draft',instructions:'Speak clearly'}).select('id').single();
  assert.ifError(error);claims.push(task.id);
  const phrase=await service.from('task_phrases').insert({task_id:task.id,position:1,expected_text:'I am recording a verified audio sample.'});
  assert.ifError(phrase.error);
  const published=await service.from('tasks').update({status:'published',published_at:new Date().toISOString()}).eq('id',task.id);
  assert.ifError(published.error);
 }
 const results=await Promise.all(Array.from({length:5},()=>a.client.rpc('allocate_my_tasks')));
 results.forEach(r=>assert.ifError(r.error));
 const {data:assignments,error:assignmentError}=await service.from('user_task_assignments').select('id,task_id').eq('user_id',a.user.id);
 assert.ifError(assignmentError);
 assert.equal(assignments.length,2,'Only two tasks can be assigned in first signup period');
 const onlyMine=await b.client.from('user_task_assignments').select('id').eq('user_id',a.user.id);
 assert.equal(onlyMine.data?.length,0,'Member B cannot see A assignment');
 const submission=await a.client.rpc('submit_my_task',{p_assignment_id:assignments[0].id,p_idempotency_key:crypto.randomUUID()});
 assert.ok(submission.error,'A task without recorded phrases cannot be submitted');
 const payout=await a.client.rpc('request_my_withdrawal',{p_amount_pence:25000,p_destination_id:crypto.randomUUID(),p_idempotency_key:crypto.randomUUID()});
 assert.ok(payout.error,'Withdrawal without real identity verification must fail');
 const storage=await a.client.storage.from('identity-documents').list(b.user.id);
 assert.ok(storage.error||storage.data?.length===0,'KYC is not publicly listable');
});
after(async()=>{
 if(claims.length)await service.from('tasks').delete().in('id',claims);
 for(const id of ids)await service.auth.admin.deleteUser(id);
});
