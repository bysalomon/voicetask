import {useState} from 'react';
import {X,RefreshCw} from 'lucide-react';
import {supabase} from '../lib/core';
type Clip={id:string;position:number;text:string;url:string};
type Payload={submission_id:string;status:string;recordings:Clip[]};
export function AudioReview({submissionId,onClose}:{submissionId:string;onClose:()=>void}){
 const [data,setData]=useState<Payload|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function load(){
  setBusy(true);setMessage('');
  const result=await supabase.functions.invoke('review-audio',{body:{submission_id:submissionId,action:'inspect'}});
  if(result.error)setMessage('Could not access the private recording: '+result.error.message);
  else setData(result.data as Payload);
  setBusy(false);
 }
 return <div className="modalShade" onMouseDown={onClose}>
  <section className="dialog reviewDialog" role="dialog" aria-modal="true" aria-label="Inspect submitted audio" onMouseDown={e=>e.stopPropagation()}>
   <button className="iconButton dialogX" aria-label="Close review" onClick={onClose}><X size={19}/></button>
   <span className="eyebrow">RECORDING AUDIT</span><h2>Submitted recordings</h2>
   <p className="muted">VoiceTask accepts completed uploads automatically after five minutes. No independent pronunciation, transcript, emotional tone or speech-quality verification is performed. This viewer allows authorised staff to listen to the private audio but does not authorise or trigger a payment.</p>
   {!data?<button className="primary" disabled={busy} onClick={()=>void load()}>{busy?'Loading…':'Open private recording'}</button>:<>
     <p role="status">Task status: <strong>{data.status.replaceAll('_',' ')}</strong></p>
     <div className="reviewClips">{data.recordings.map(r=><div key={r.id} className="reviewClip">
       <strong>Phrase {r.position}</strong><blockquote>“{r.text}”</blockquote>
       <audio controls preload="none" src={r.url} aria-label={'Recording for phrase '+r.position}/>
       <small>Private playback link expires after 120 seconds.</small>
     </div>)}</div>
     <button className="outlineButton" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/> Refresh private links</button>
   </>}
   {message&&<p className="notice" role="status">{message}</p>}
  </section>
 </div>;
}