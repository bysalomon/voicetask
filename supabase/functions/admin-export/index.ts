import {service,cors,admin,fail,requirePost} from '../_shared/server.ts';
const allowed={
 users:{table:'profiles',columns:'id,full_name,public_display_name,country,status,created_at'},
 withdrawals:{table:'withdrawal_requests',columns:'id,user_id,requested_pence,provider,status,requested_at,resolved_at'},
 'completed-tasks':{table:'task_submissions',columns:'id,user_id,status,submitted_at,approved_at,approved_duration_ms,review_reason'},
 analytics:{table:'admin_analytics',columns:'*'},
 'audit-logs':{table:'audit_logs',columns:'id,actor_user_id,action,entity_type,entity_id,created_at'}
} as const;
function safeCell(value:unknown){let text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await admin(req);
 const {kind}=await req.json() as {kind:keyof typeof allowed};
 if(!(kind in allowed))throw Error('Export scope not permitted');
 const cfg=allowed[kind];
 const columns:string=cfg.columns;const {data,error}=await service.from(cfg.table).select(columns).limit(5000);
 if(error)throw error;
 const entries=(data||[]) as unknown as Record<string,unknown>[];
 const fields=cfg.columns==='*'?Object.keys(entries[0]||{}):cfg.columns.split(',');
 const lines=[fields.map(safeCell).join(','),...entries.map(entry=>fields.map(k=>safeCell(entry[k])).join(','))];
 await service.from('audit_logs').insert({actor_user_id:user.id,action:'data.export',entity_type:kind,after_filtered:{rows:entries.length}});
 const csv='\uFEFF'+lines.join('\r\n');
 const headers=new Headers({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="voicetask-'+kind+'.csv"','Cache-Control':'no-store','Access-Control-Allow-Origin':Deno.env.get('ALLOWED_ORIGIN')||'https://invalid.example','Vary':'Origin'});
 return new Response(csv,{status:200,headers});
}catch(e){return fail(e)}});
