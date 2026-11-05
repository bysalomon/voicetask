import {reply,cors,admin,fail,requirePost} from '../_shared/server.ts';
// VoiceTask pays recipients outside the platform. No network payouts originate here.
Deno.serve(async req=>{
 try{
   const pre=cors(req);if(pre)return pre;requirePost(req);
   await admin(req);
   return reply({message:'Automatic payouts are disabled. Use the staff-managed payment queue and record an actual external transfer before marking paid.'},409);
 }catch(e){return fail(e)}
});
