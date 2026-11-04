import {service,reply,cors,fail,requirePost,sha256} from '../_shared/server.ts';

Deno.serve(async req=>{
  try{
    const pre=cors(req);
    if(pre)return pre;
    requirePost(req);
    const b=await req.json();
    if(
      !/^[0-9]{8}$/.test(b.pin||'') ||
      !/^\S+@\S+\.\S+$/.test(b.email||'') ||
      !['GB','US','FR','IT'].includes(b.country) ||
      !b.full_name?.trim() || !b.mobile?.trim() ||
      !b.consents?.terms || !b.consents?.privacy ||
      !b.consents?.data_use || !b.consents?.age_18
    )throw Error('Invalid registration details or consent');

    // Do not allocate a one-use invitation until email delivery is configured.
    if(!Deno.env.get('RESEND_API_KEY')||!Deno.env.get('RESEND_FROM'))
      throw Error('Invitations cannot be redeemed until verified email delivery is configured');

    // /invitation with no query is an intentional registration route.
    // A unique, auditable one-use invitation is issued on the server.
    // Explicit ?token=... invitations retain their existing one-use validation.
    let tokenHash:string|undefined;
    let invitationId:string;
    if(b.token!==undefined && b.token!==null){
      if(typeof b.token!=='string'||b.token.length<24)throw Error('Invalid invitation');
      tokenHash=await sha256(b.token);
      const {data:valid,error}=await service.rpc('claim_invite_for_registration',{p_hash:tokenHash});
      if(error||!valid)throw Error('This invitation has expired or has already been used.');
      invitationId=valid;
    }else{
      const emailHash=await sha256(String(b.email).trim().toLowerCase());
      const {data:issued,error}=await service.rpc('reserve_page_invitation',{p_email_hash:emailHash});
      if(error||!issued)throw Error(error?.message||'Registration temporarily unavailable');
      invitationId=issued;
    }

    let createdId:string|undefined;
    try{
      const {data:account,error:createError}=await service.auth.admin.createUser({
        email:b.email.trim(),password:b.pin,email_confirm:false,
        user_metadata:{full_name:b.full_name.trim(),mobile:b.mobile,country:b.country}
      });
      if(createError||!account.user)throw createError||Error('Account could not be created');
      createdId=account.user.id;

      const {error:redeemError}=await service.from('invitation_redemptions')
        .insert({token_id:invitationId,user_id:createdId});
      if(redeemError)throw redeemError;

      for(const [purpose,choice] of Object.entries(b.consents)){
        const {error:consentError}=await service.from('consent_records').insert({
          user_id:createdId,policy_version:'prelaunch-2026-11',
          data_use_purpose:purpose,choice,legal_basis:'contract'
        });
        if(consentError)throw consentError;
      }

      const {data:link,error:linkError}=await service.auth.admin.generateLink({
        type:'magiclink',email:b.email.trim()
      });
      if(linkError||!link.properties?.action_link)
        throw linkError||Error('Could not prepare verification');

      const mail=await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{Authorization:'Bearer '+Deno.env.get('RESEND_API_KEY'),'Content-Type':'application/json'},
        body:JSON.stringify({
          from:Deno.env.get('RESEND_FROM'),to:[b.email.trim()],
          subject:'Verify your VoiceTask account',
          html:'<p>Please verify your account:</p><p><a href="'+link.properties.action_link+'">Verify email address</a></p>'
        })
      });
      if(!mail.ok)throw Error('Verification email could not be delivered');
      return reply({message:'Please verify your email address to continue.'});
    }catch(e){
      // Clear dependent records before deleting the Auth user.
      if(createdId){
        await service.from('consent_records').delete().eq('user_id',createdId);
        await service.from('invitation_redemptions').delete().eq('user_id',createdId);
        await service.auth.admin.deleteUser(createdId);
      }
      if(tokenHash)await service.rpc('release_invite_claim',{p_hash:tokenHash});
      throw e;
    }
  }catch(e){return fail(e)}
});
