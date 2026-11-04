import {service,reply,cors,actor,fail,requirePost} from '../_shared/server.ts';
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await actor(req);const b=await req.json();
 if(b.type!=='paypal'||typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email)||b.email.length>254)throw Error('Valid PayPal recipient email required');
 const {data:profile}=await service.from('profiles').select('country,status').eq('id',user.id).single();
 if(!profile||profile.status!=='active')throw Error('Account not active');
 const {data:existing}=await service.from('payout_destinations').select('id').eq('user_id',user.id).eq('type','paypal').eq('provider_token_ref',b.email.toLowerCase()).limit(1);
 if(existing?.length)return reply({message:'This destination is already awaiting verification.'});
 const email=b.email.toLowerCase();const masked=email[0]+'***@'+email.split('@')[1];
 const {data:dest,error}=await service.from('payout_destinations').insert({user_id:user.id,type:'paypal',provider_token_ref:email,masked_display:masked,country:profile.country,verified:false}).select('id').single();
 if(error)throw error;
 return reply({id:dest.id,message:'Payment destination registered. Recipient eligibility and ownership must be verified before use.'});
}catch(e){return fail(e)}});
