import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '../lib/core';
import {useAuth} from '../context/Auth';

type Enrollment={id:string;qr:string;secret:string};
export function AdminSecuritySetup(){
  const {user,refresh}=useAuth();
  const [busy,setBusy]=useState(false);
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [passwordUpgraded,setPasswordUpgraded]=useState(false);
  const [factor,setFactor]=useState<Enrollment|null>(null);
  const [verifyCode,setVerifyCode]=useState('');
  const [mfaEnabled,setMfaEnabled]=useState(false);
  const [aal2,setAal2]=useState(false);
  const [message,setMessage]=useState('');
  const {data:role,error:roleError}=useQuery({
    queryKey:['admin-bootstrap-role',user?.id],
    enabled:!!user,
    queryFn:async()=>{
      const {data,error}=await supabase.from('user_roles').select('role')
        .eq('user_id',user!.id).eq('role','admin').maybeSingle();
      if(error)throw error;
      return data;
    }
  });
  useEffect(()=>{
    if(!role||!user)return;
    let cancelled=false;
    void (async()=>{
      const [factors,assurance]=await Promise.all([
        supabase.auth.mfa.listFactors(),supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      if(cancelled)return;
      if(factors.error||assurance.error){
        setMessage('Unable to check the current account security settings.');
        return;
      }
      setMfaEnabled(!!factors.data?.totp.some(f=>f.status==='verified'));
      setAal2(assurance.data?.currentLevel==='aal2');
    })();
    return()=>{cancelled=true;};
  },[role,user?.id]);
  if(roleError)return <p role="alert" className="error">Administrator settings could not be loaded.</p>;
  if(!role)return null;

  async function upgradePassword(e:FormEvent){
    e.preventDefault();
    if(newPassword!==confirmPassword){setMessage('New passwords do not match.');return;}
    if(newPassword.length<14||!/[A-Za-z]/.test(newPassword)||!/[0-9]/.test(newPassword)||!(/[^A-Za-z0-9]/.test(newPassword))){
      setMessage('Use 14 or more characters, including a letter, a number and a symbol.');return;
    }
    if(!user?.email){setMessage('Your session has no email address.');return;}
    setBusy(true);setMessage('');
    try{
      // Require knowledge of the existing access code before replacing it.
      const login=await supabase.auth.signInWithPassword({email:user.email,password:currentPassword});
      if(login.error)throw new Error('Your current access code could not be verified.');
      const updated=await supabase.auth.updateUser({password:newPassword});
      if(updated.error)throw updated.error;
      setCurrentPassword('');setNewPassword('');setConfirmPassword('');
      setPasswordUpgraded(true);
      setMessage('Administrator password saved. Use this password for future member and admin sign-ins.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not change your password.');}
    finally{setBusy(false);}
  }
  async function enroll(){
    setBusy(true);setMessage('');
    try{
      const result=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'VoiceTask Administrator'});
      if(result.error)throw result.error;
      setFactor({id:result.data.id,qr:result.data.totp.qr_code,secret:result.data.totp.secret});
      setMessage('Scan the QR code with your authenticator and enter the current six-digit code.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not start authenticator enrolment.');}
    finally{setBusy(false);}
  }
  async function verify(){
    if(!factor||!/^[0-9]{6}$/.test(verifyCode)){setMessage('Enter the six-digit code from the authenticator.');return;}
    setBusy(true);setMessage('');
    try{
      const result=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code:verifyCode});
      if(result.error)throw result.error;
      setFactor(null);setVerifyCode('');setMfaEnabled(true);
      const {data}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setAal2(data?.currentLevel==='aal2');
      await refresh();
      setMessage('Authenticator verified. Your current session now has administrator-level MFA.');
    }catch(error){setMessage(error instanceof Error?error.message:'Authenticator verification failed.');}
    finally{setBusy(false);}
  }
  return <section className="panel formStack" aria-label="Administrator account setup">
    <h2>Administrator security</h2>
    <p className="muted">Administrator access requires a strong password and a verified authenticator. Do not share your password, authenticator QR code, or verification code.</p>
    <form className="formStack" onSubmit={e=>void upgradePassword(e)}>
      <h3>1. Set a strong administrator password</h3>
      {passwordUpgraded&&<p role="status">Strong password updated in this session.</p>}
      <label>Current 8-digit access code
        <input type="password" autoComplete="current-password" required minLength={8}
          value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/>
      </label>
      <label>New administrator password
        <input type="password" autoComplete="new-password" minLength={14} required
          value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
      </label>
      <label>Confirm new administrator password
        <input type="password" autoComplete="new-password" minLength={14} required
          value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/>
      </label>
      <button className="outlineButton" type="submit" disabled={busy}>Update administrator password</button>
    </form>
    <div className="formStack">
      <h3>2. Secure your account with an authenticator</h3>
      {mfaEnabled?<p>Authenticator is enrolled. {aal2?'Current session verified (AAL2).':'Sign in via the administrator page and enter a fresh authenticator code.'}</p>:
      <>{!factor&&<button className="outlineButton" type="button" disabled={busy} onClick={()=>void enroll()}>Set up authenticator</button>}
      {factor&&<div className="formStack">
        <p>Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
        <img src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(factor.qr)} width={220} height={220} alt="Private QR code for VoiceTask administrator authenticator" />
        <details><summary>Cannot scan? Enter the secret manually</summary><code>{factor.secret}</code></details>
        <label>Six-digit authenticator code
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
            value={verifyCode} onChange={e=>setVerifyCode(e.target.value)}/>
        </label>
        <button className="primary" type="button" disabled={busy} onClick={()=>void verify()}>Verify and activate MFA</button>
      </div>}</>}
    </div>
    {mfaEnabled&&<div className="formStack">
      <h3>3. Open administration</h3>
      <p className="muted">Use your stronger password and authenticator code whenever you sign in as an administrator.</p>
      <Link className="primary" to={aal2?'/admsalomon':'/admsalomon/login'}>Open administrator area</Link>
    </div>}
    {message&&<p role="status" className="notice">{message}</p>}
  </section>;
}
