import {reply} from '../_shared/server.ts';
// Disabled by design: staff independently performs manual payouts and records proof.
// No payment state may be changed by incoming provider webhooks.
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'POST required'},405);
 return reply({message:'Automated payment webhooks are disabled in manual payout mode.'},409);
});
