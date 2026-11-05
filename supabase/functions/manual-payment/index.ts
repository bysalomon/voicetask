import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 try{
   const pre=cors(req);if(pre)return pre;requirePost(req);
   // Every operation requires Supabase AAL2 + a verified admin role.
   const actor=await admin(req);const body=await req.json();
   if(!['recipient-details','approve-recipient','start','paid'].includes(body.action))
     throw Error('Unsupported manual payment operation');
   if(body.action==='recipient-details'||body.action==='approve-recipient'){
     if(!uuid.test(body.destination_id||''))throw Error('Valid destination required');
     const {data:destination,error}=await service.from('payout_destinations')
       .select('id,user_id,type,masked_display,provider_token_ref,verified,country')
       .eq('id',body.destination_id).single();
     if(error||!destination)throw Error('Recipient not found');
     if(body.action==='recipient-details'){
       await service.from('audit_logs').insert({
         actor_user_id:actor.id,action:'payout.recipient_viewed',
         entity_type:'payout_destinations',entity_id:destination.id,
         after_filtered:{type:destination.type,verified:destination.verified}
       });
       // Sensitive recipient details are never placed in a public table or browser URL.
       return reply({id:destination.id,type:destination.type,
         recipient:destination.provider_token_ref,country:destination.country,
         verified:destination.verified});
     }
     if(typeof body.reason!=='string'||body.reason.trim().length<15)throw Error('Staff verification note required');
     const result=await service.rpc('staff_verify_payment_destination',{
       p_destination:destination.id,p_actor:actor.id,p_reason:body.reason.trim()});
     if(result.error)throw result.error;
     return reply({changed:result.data,message:result.data?'Recipient approved for staff-managed transfers.':'Recipient was already approved.'});
   }
   if(!uuid.test(body.withdrawal_id||''))throw Error('Valid withdrawal required');
   if(typeof body.reason!=='string'||body.reason.trim().length<15)
     throw Error('Detailed administrative note required');
   if(body.action==='start'){
     const result=await service.rpc('staff_start_manual_payout',{
       p_id:body.withdrawal_id,p_actor:actor.id,p_reason:body.reason.trim()});
     if(result.error)throw result.error;
     return reply({changed:result.data,message:result.data?'Manual payment is now being processed. No money has been sent by VoiceTask.':'Payment was already processing.'});
   }
   if(typeof body.reference!=='string'||body.reference.trim().length<6)
     throw Error('External payment reference required to mark paid');
   const result=await service.rpc('staff_confirm_manual_payout',{
     p_id:body.withdrawal_id,p_actor:actor.id,
     p_reference:body.reference.trim(),p_reason:body.reason.trim()});
   if(result.error)throw result.error;
   return reply({changed:result.data,message:result.data?'Staff-confirmed external payment recorded.':'Withdrawal was already paid.'});
 }catch(e){return fail(e)}
});
