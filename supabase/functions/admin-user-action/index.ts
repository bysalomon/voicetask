import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';
const uuid=/^[a-f0-9-]{36}$/i;
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await admin(req);const b=await req.json();
 if(!['suspend','reactivate','notify','adjust-wallet','confirm-adjustment'].includes(b.action))throw Error('Unsupported action');
 if(!uuid.test(b.user_id||'')&&!['confirm-adjustment'].includes(b.action))throw Error('Valid member required');
 if(typeof b.reason!=='string'||b.reason.trim().length<15)throw Error('A detailed audit reason is mandatory');
 if(b.action==='confirm-adjustment'){
  if(!uuid.test(b.adjustment_id||''))throw Error('Adjustment request required');
  const {data,error}=await service.rpc('apply_wallet_adjustment_secure',{p_request:b.adjustment_id,p_actor:user.id});if(error)throw error;
  return reply({success:data,message:'Adjustment confirmed and posted to immutable wallet ledger.'});
 }
 if(b.action==='adjust-wallet'){
  if(!Number.isSafeInteger(b.amount_pence)||b.amount_pence===0)throw Error('Signed integer pence required');
  const {data:id,error}=await service.rpc('propose_wallet_adjustment_secure',{p_user:b.user_id,p_amount_pence:b.amount_pence,p_actor:user.id,p_reason:b.reason});
  if(error)throw error;
  return reply({id,message:Math.abs(b.amount_pence)>10000?'Awaiting another administrator for the requested wallet correction.':'Wallet correction posted to immutable ledger.'});
 }
 if(b.action==='notify'){
  if(typeof b.message!=='string'||b.message.length<3||b.message.length>2000)throw Error('Notification must contain 3–2000 characters');
  const {error}=await service.from('notifications').insert({user_id:b.user_id,title:'Message from VoiceTask support',body:b.message,type:'information',deep_link:'/app'});if(error)throw error;
 }else{
  const status=b.action==='suspend'?'suspended':'active';
  const {data:profile,error}=await service.from('profiles').update({status}).eq('id',b.user_id).select('id').maybeSingle();
  if(error||!profile)throw Error('User update failed');
 }
 await service.from('audit_logs').insert({actor_user_id:user.id,action:'user.'+b.action,entity_type:'profiles',entity_id:b.user_id,after_filtered:{reason:b.reason}});
 return reply({message:'Operation completed and audited.'});
}catch(e){return fail(e)}});
