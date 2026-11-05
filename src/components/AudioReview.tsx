import {useState} from 'react';import {useQueryClient} from '@tanstack/react-query';import {X,Mic,ShieldCheck,CheckCircle,RefreshCw} from 'lucide-react';import {supabase,duration} from '../lib/core';
type Clip={id:string;position:number;text:string;url:string;quality_state:string;duration_ms:number|null;voice_seconds_ms:number|null;quality:{checks?:{transcript?:string;similarity?:number;confidence?:number;error?:string};final_decision?:string}|null};
type Payload={submission_id:string;status:string;recordings:Clip[]};
export function AudioReview({submissionId,onClose}:{submissionId:string;onClose:()=>void}){
 const [data,setData]=useState<Payload|null>(null);const [busy,setBusy]=useState(false);const [reason,setReason]=useState('');const [attest,setAttest]=useState(false);const [message,setMessage]=useState('');const qc=useQueryClient();
 async function load(action:'inspect'|'analyse'){
  setBusy(true);setMessage('');const result=await supabase.functions.invoke('review-audio',{body:{submission_id:submissionId,action}});
  if(result.error){setMessage(result.error.message);setBusy(false);return;}
  if(action==='analyse'){setMessage(result.data?.message||'The quality review was requested.');setBusy(false);await load('inspect');return;}
  setData(result.data as Payload);setBusy(false);
 }
 async function approve(){
  if(!attest||reason.trim().length<15||!data?.recordings?.every(r=>r.quality_state==='passed'))return;
  setBusy(true);setMessage('');
  const {data:result,error}=await supabase.functions.invoke('admin-action',{body:{action:'approve-audio',id:submissionId,reason:reason.trim()}});
  setMessage(error?.message||result?.message||'Approval was submitted for database verification.');setBusy(false);
  if(!error)await qc.invalidateQueries({queryKey:['admin']});
 }
 const verified=!!data?.recordings.length&&data.recordings.every(r=>r.quality_state==='passed'&&r.quality?.final_decision==='passed');
 return <div className="modalShade" onMouseDown={onClose}><section className="dialog reviewDialog" role="dialog" aria-modal="true" aria-label="Review audio submission" onMouseDown={e=>e.stopPropagation()}>
 <button className="iconButton dialogX" aria-label="Close review" onClick={onClose}><X size={19}/></button>
 <span className="eyebrow">SECURE QUALITY REVIEW</span><h2>Review recording submission</h2>
 <p className="muted">Listen to every recording, compare it with its phrase and verify the requested tone. Transcription and duration require a configured quality provider. No payment can be credited before server validation.</p>
 {!data?<button className="primary" disabled={busy} onClick={()=>void load('inspect')}>{busy?'Opening…':'Open private recordings'}</button>:<>
 <div className="reviewClips">{data.recordings.map(r=><div key={r.id} className="reviewClip">
 <div className="reviewClipTop"><strong>Phrase {r.position}</strong><span className={'statusPill '+(r.quality_state==='passed'?'passed':'')}>{r.quality_state.replaceAll('_',' ')}</span></div>
 <blockquote>“{r.text}”</blockquote><audio controls preload="none" src={r.url} aria-label={'Recording for phrase '+r.position}/>
 {r.quality?.checks?.transcript&&<p className="muted">ASR: {r.quality.checks.transcript}</p>}
 {r.quality?.checks?.error&&<p className="error" role="alert">Automatic audio validation: {r.quality.checks.error}</p>}
 <small>{r.voice_seconds_ms?duration(r.voice_seconds_ms):'Awaiting measured voice duration'} · The player URL expires shortly</small>
 </div>)}</div>
 <div className="inlineActions"><button className="outlineButton" disabled={busy} onClick={()=>void load('inspect')}><RefreshCw size={16}/> Refresh links</button><button className="outlineButton" disabled={busy} onClick={()=>void load('analyse')}><Mic size={16}/> Analyse audio</button></div>
 <div className="reviewApproval"><h3><ShieldCheck size={18}/> Human tone assessment</h3>
 <label className="check"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/> I personally listened to all phrases and verified their requested speaking tone.</label>
 <label>Detailed quality review notes<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="What did you verify about the emotion, clarity and accurate wording? (minimum 15 characters)"/></label>
 <button className="primary" onClick={()=>void approve()} disabled={busy||!attest||reason.trim().length<15||!verified}><CheckCircle size={16}/> Approve verified task & credit wallet</button>
 {!verified&&<p className="muted">Approval is unavailable until all phrases pass the independent speech content, duration and integrity checks.</p>}
 </div></>}
 {message&&<p className="notice" role="status">{message}</p>}
 </section></div>
}
