import {useState} from 'react';import {useQuery,useQueryClient} from '@tanstack/react-query';import {X,ShieldAlert,Wallet,MessageCircle,Users} from 'lucide-react';import {supabase,pounds} from '../lib/core';
export function UserControls({id,onClose}:{id:string;onClose:()=>void}){
 const [action,setAction]=useState<'suspend'|'reactivate'|'notify'|'adjust-wallet'>('notify');
 const [reason,setReason]=useState('');const [message,setMessage]=useState('');const [amount,setAmount]=useState('');const [feedback,setFeedback]=useState('');const [busy,setBusy]=useState(false);
 const qc=useQueryClient();
 const {data}=useQuery({queryKey:['admin-member',id],queryFn:async()=>{
  const [profile,wallet,kyc]=await Promise.all([
   supabase.from('profiles').select('id,full_name,email_display,country,status,created_at').eq('id',id).single(),
   supabase.from('wallet_accounts').select('available_pence,reserved_pence').eq('user_id',id).maybeSingle(),
   supabase.from('identity_verifications').select('status').eq('user_id',id).order('submitted_at',{ascending:false}).limit(1)]);
  if(profile.error)throw profile.error;
  return {profile:profile.data,wallet:wallet.data,kyc:kyc.data?.[0]?.status};
 }});
 async function submit(){
  if(reason.trim().length<15)return;
  const amountPence=Math.round(Number(amount)*100);
  if(action==='adjust-wallet'&&(!Number.isSafeInteger(amountPence)||amountPence===0)){setFeedback('A non-zero GBP amount is required.');return;}
  setBusy(true);setFeedback('');
  const {data:result,error}=await supabase.functions.invoke('admin-user-action',{body:{action,user_id:id,reason:reason.trim(),message,amount_pence:amountPence}});
  setFeedback(error?.message||result?.message||'Operation sent to server');
  if(!error){await qc.invalidateQueries({queryKey:['admin']});await qc.invalidateQueries({queryKey:['admin-member',id]})}
  setBusy(false);
 }
 return <div className="modalShade" onMouseDown={onClose}><section className="dialog reviewDialog" role="dialog" aria-modal="true" aria-label="Manage member" onMouseDown={e=>e.stopPropagation()}>
 <button className="iconButton dialogX" aria-label="Close member controls" onClick={onClose}><X size={18}/></button>
 <span className="eyebrow">ADMINISTRATION · MEMBER SECURITY</span><h2>Manage member</h2>
 <div className="panel"><h3>{data?.profile?.full_name||'Member'}</h3><p className="muted">{data?.profile?.email_display||id} · {data?.profile?.country||'—'}</p>
 <p className="muted">Status: {data?.profile?.status||'—'} · KYC: {data?.kyc||'not started'}</p>
 <p>Available {pounds(data?.wallet?.available_pence||0)} · Reserved {pounds(data?.wallet?.reserved_pence||0)}</p></div>
 <div className="chips" role="group" aria-label="Member operation">{([['notify','Notify',MessageCircle],['suspend','Suspend',ShieldAlert],['reactivate','Reactivate',Users],['adjust-wallet','Wallet correction',Wallet]] as const).map(([key,label,Icon])=><button className={'chip '+(action===key?'selected':'')} key={key} onClick={()=>setAction(key)}><Icon size={13}/> {label}</button>)}</div>
 {action==='notify'&&<label>Notification text<textarea required value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write your direct member notification"/></label>}
 {action==='adjust-wallet'&&<label>Signed amount (GBP) — negative to deduct<input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="10.00"/></label>}
 <label>Reason for administrator action (audit log)<textarea minLength={15} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Document the exact reason, verified evidence and authorisation."/></label>
 {action==='adjust-wallet'&&<p className="muted">Corrections above £100 require a second administrator. Wallet entries remain immutable; no direct balance edits.</p>}
 <button className="primary" disabled={busy||reason.trim().length<15||action==='notify'&&message.trim().length<3} onClick={()=>void submit()}>{busy?'Submitting…':'Confirm '+action.replaceAll('-',' ')}</button>
 {feedback&&<p role="status" className="notice">{feedback}</p>}
 </section></div>;
}
export function ConfirmWalletAdjustment({id,onDone}:{id:string;onDone:()=>void}){
 const [reason,setReason]=useState('');const [error,setError]=useState('');
 async function submit(){if(reason.trim().length<15)return;const {data,error:e}=await supabase.functions.invoke('admin-user-action',{body:{action:'confirm-adjustment',adjustment_id:id,reason}});setError(e?.message||data?.message||'Submitted');if(!e)onDone()}
 return <div className="reviewApproval"><label>Second administrator confirmation reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="primary" disabled={reason.trim().length<15} onClick={()=>void submit()}>Confirm verified ledger adjustment</button>{error&&<p role="status">{error}</p>}</div>
}
