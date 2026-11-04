import {useState,type FormEvent} from 'react';import {useQuery,useQueryClient} from '@tanstack/react-query';import {MessageCircle,Send,Plus,Check} from 'lucide-react';import {supabase,dates} from '../lib/core';import {useAuth} from '../context/Auth';
type Ticket={id:string;owner_id:string;subject:string;status:string;created_at:string};
type Message={id:string;ticket_id:string;sender_id:string;body:string;created_at:string};
export function SupportPage({admin=false}:{admin?:boolean}){
 const {user}=useAuth();const qc=useQueryClient();const [selected,setSelected]=useState<string|null>(null);const [subject,setSubject]=useState('');const [body,setBody]=useState('');const [draft,setDraft]=useState('');const [status,setStatus]=useState('');
 const {data:tickets=[],isLoading,error}=useQuery({queryKey:['support-tickets',user?.id,admin],enabled:!!user,queryFn:async()=>{
  const {data,error}=await supabase.from('support_tickets').select('id,owner_id,subject,status,created_at').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;return data as Ticket[];
 }});
 const current=tickets.find(t=>t.id===selected)||tickets[0]||null;
 const {data:messages=[]}=useQuery({queryKey:['support-messages',current?.id],enabled:!!current,refetchInterval:15000,queryFn:async()=>{
  const {data,error}=await supabase.from('support_messages').select('id,ticket_id,sender_id,body,created_at').eq('ticket_id',current!.id).order('created_at');
  if(error)throw error;return data as Message[];
 }});
 async function create(e:FormEvent){e.preventDefault();setStatus('');const {data,error}=await supabase.from('support_tickets').insert({owner_id:user!.id,subject:subject.trim(),status:'open'}).select('id').single();if(error){setStatus(error.message);return}const first=await supabase.from('support_messages').insert({ticket_id:data.id,sender_id:user!.id,body:body.trim()});if(first.error){setStatus(first.error.message);return}setSelected(data.id);setSubject('');setBody('');void qc.invalidateQueries({queryKey:['support-tickets']})}
 async function reply(e:FormEvent){e.preventDefault();if(!current||!draft.trim())return;const {error}=await supabase.from('support_messages').insert({ticket_id:current.id,sender_id:user!.id,body:draft.trim()});if(error){setStatus(error.message);return}setDraft('');void qc.invalidateQueries({queryKey:['support-messages',current.id]})}
 async function close(){if(!current)return;const {error}=await supabase.from('support_tickets').update({status:'closed'}).eq('id',current.id);if(error){setStatus(error.message);return}void qc.invalidateQueries({queryKey:['support-tickets']})}
 return <><div className="pageHeading"><div><span className="eyebrow">{admin?'ADMIN SUPPORT':'HELP & SUPPORT'}</span><h1>Support tickets</h1><p>{admin?'Review and reply to member requests.':'Get help with tasks, your account and verification.'}</p></div></div>
 {error&&<p role="alert" className="error">Unable to retrieve support tickets.</p>}
 <div className="supportGrid"><div className="panel formStack"><h2><MessageCircle size={17}/> Conversations</h2>
 {isLoading?<p className="muted">Loading tickets…</p>:tickets.length?tickets.map(t=><button className={'supportTicket '+(current?.id===t.id?'selected':'')} key={t.id} onClick={()=>setSelected(t.id)}><strong>{t.subject}</strong><small>{t.status} · {dates(t.created_at)}</small></button>):<div className="emptyState">No conversations yet.</div>}
 {!admin&&<form className="formStack" onSubmit={e=>void create(e)}><h3><Plus size={17}/> New support ticket</h3><label>Subject<input required maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="How can we help?"/></label><label>Message<textarea minLength={10} maxLength={3000} required value={body} onChange={e=>setBody(e.target.value)} placeholder="Describe your issue, without sensitive documents or PINs."/></label><button className="outlineButton"><Plus size={14}/> Create ticket</button></form>}
 </div><section className="panel formStack"><div className="sectionHeading"><h2>{current?.subject||'Select a conversation'}</h2>{admin&&current?.status!=='closed'&&<button className="outlineButton" onClick={()=>void close()}><Check size={14}/> Close ticket</button>}</div>
 {current?<><p className="muted">{current.status} · Started {dates(current.created_at)}</p>
 <div className="supportMessages">{messages.map(m=><div className={'supportMessage '+(m.sender_id===user?.id?'own':'')} key={m.id}><small>{m.sender_id===user?.id?'You':'Other participant'} · {dates(m.created_at)}</small><p>{m.body}</p></div>)}</div>
 {current.status!=='closed'?<form className="formStack" onSubmit={e=>void reply(e)}><label>Your reply<textarea value={draft} onChange={e=>setDraft(e.target.value)} minLength={1} maxLength={3000} required/></label><button className="primary"><Send size={15}/> Send reply</button></form>:<p className="muted">This ticket is closed.</p>}</>:<div className="emptyState">Select or create a support conversation.</div>}
 </section></div>{status&&<p role="alert" className="notice">{status}</p>}</>
}
