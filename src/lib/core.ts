import { createClient } from '@supabase/supabase-js';
export const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder');
export const pounds = (pence:number) => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
export const dates = (date:string) => new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(date));
export const categories = ['Crying Voice','Angry Voice','Sad Voice','Happy Voice','Commercial Voice','Excited Voice'] as const;
export const levels = [{label:'Beginner',hours:0},{label:'Recruit',hours:4},{label:'Operator',hours:12},{label:'Professional',hours:27},{label:'Specialist',hours:52},{label:'Expert',hours:92},{label:'Elite',hours:157},{label:'Master',hours:257},{label:'Commander',hours:407},{label:'Legend',hours:657}];
export function progress(ms:number){const h=ms/3600000;const i=levels.reduce((a,v,n)=>h>=v.hours?n:a,0);const next=levels[i+1];return {level:levels[i].label,index:i,percent:next?Math.min(100,Math.max(0,(h-levels[i].hours)/(next.hours-levels[i].hours)*100)):100,remaining:next?Math.max(0,next.hours-h):0,next:next?.label||null};}
export function duration(ms:number){const m=Math.floor(ms/60000);return Math.floor(m/60)+'h '+(m%60)+'m';}
export type Assignment={id:string;task_id:string;status:string;category_snapshot:string;reward_pence_snapshot:number;tasks:{title:string;description:string|null;instructions:string|null;estimated_minutes:number|null}|null};
