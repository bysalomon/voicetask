import {service,reply,cors,actor,fail,requirePost} from '../_shared/server.ts';
function checkMagic(b:Uint8Array,mime:string){if(mime==='application/pdf')return b[0]===37&&b[1]===80&&b[2]===68&&b[3]===70;if(mime==='image/png')return b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;if(mime==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;if(mime==='image/webp')return String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';return false}
Deno.serve(async req=>{try{
 const pre=cors(req);if(pre)return pre;requirePost(req);const user=await actor(req);const b=await req.json();
 const {data:previous}=await service.from('identity_verifications').select('id,status').eq('user_id',user.id).in('status',['submitted','processing','manual_review','verified']).limit(1);
 if(previous?.length)throw Error('Verification is already in progress or complete');
 if(!['passport','national_id'].includes(b.doc_type))throw Error('Unsupported document type');
 if(b.finalise){
  const docs=b.paths;if(!Array.isArray(docs)||docs.length!==(b.doc_type==='national_id'?2:1))throw Error('Required document sides missing');
  if(new Set(docs.map((d:{side:string})=>d.side)).size!==docs.length)throw Error('Duplicate document sides');
  const entries:{storage_path:string;doc_type:string;side:string;retention_expiry:string}[]=[];
  for(const doc of docs){
   if(!['front','back'].includes(doc.side)||typeof doc.path!=='string'||!doc.path.startsWith(user.id+'/'))throw Error('Invalid document path');
   const path=doc.path as string;
   const {data:file,error:downloadError}=await service.storage.from('identity-documents').download(path);
   if(downloadError||!file)throw Error('Cannot inspect private identity document');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(bytes.length<100||bytes.length>10485760||!checkMagic(bytes,file.type))throw Error('The uploaded document format or size is invalid');
   entries.push({storage_path:path,doc_type:b.doc_type,side:doc.side,retention_expiry:new Date(Date.now()+90*86400000).toISOString()});
  }
  const {data:verification,error:vError}=await service.from('identity_verifications').insert({user_id:user.id,status:'submitted'}).select('id').single();
  if(vError||!verification)throw vError||Error('Cannot create verification');
  const {error:insertError}=await service.from('identity_documents').insert(entries.map(doc=>({...doc,verification_id:verification.id})));
  if(insertError){await service.from('identity_verifications').delete().eq('id',verification.id);throw insertError}
  await service.from('identity_status_events').insert({verification_id:verification.id,to_status:'submitted',source:'member_upload',actor:user.id});
  return reply({message:'Identity verification in progress',verification_id:verification.id});
 }
 if(!['front','back'].includes(b.side)||!['image/jpeg','image/png','image/webp','application/pdf'].includes(b.mime_type)||!Number.isInteger(b.size_bytes)||b.size_bytes<100||b.size_bytes>10485760)throw Error('Unsupported document');
 const extension=b.mime_type==='application/pdf'?'pdf':b.mime_type==='image/png'?'png':b.mime_type==='image/webp'?'webp':'jpg';
 const path=user.id+'/'+crypto.randomUUID()+'.'+extension;
 const {data,error}=await service.storage.from('identity-documents').createSignedUploadUrl(path);
 if(error)throw error;
 return reply({path,token:data.token});
}catch(e){return fail(e)}});
