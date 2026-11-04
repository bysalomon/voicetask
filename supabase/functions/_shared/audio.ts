import {service} from './server.ts';
export type File={id:string;phrase_id:string;path:string;mime_type:string;byte_size:number};
function normal(value:string){return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean)}
function alignment(expected:string,actual:string){const a=normal(expected),b=normal(actual);if(!a.length||!b.length)return 0;const matrix=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return Math.max(0,1-matrix[a.length][b.length]/Math.max(a.length,b.length))}
function magic(bytes:Uint8Array,mime:string){const webm=bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;const ogg=bytes[0]===79&&bytes[1]===103&&bytes[2]===103&&bytes[3]===83;const mp4=bytes[4]===102&&bytes[5]===116&&bytes[6]===121&&bytes[7]===112;return mime.includes('webm')?webm:mime.includes('ogg')?ogg:mime.includes('mp4')?mp4:false}
export async function validate(file:File,expected:string){
 const {data,error}=await service.storage.from('voice-recordings').download(file.path);
 if(error||!data)throw Error('Stored recording could not be read');
 const bytes=new Uint8Array(await data.arrayBuffer());
 const checks:{[key:string]:unknown}={actual_byte_size:bytes.length,mime_type:file.mime_type,magic_valid:magic(bytes,file.mime_type),expected_text:expected};
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==file.byte_size||bytes.length<100||bytes.length>26214400||!checks.magic_valid)throw Error('Recording integrity mismatch');
 const token=Deno.env.get('DEEPGRAM_API_KEY');if(!token)throw Error('ASR provider not configured; recordings cannot be approved yet');
 const res=await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=en-GB&smart_format=true',{method:'POST',headers:{Authorization:'Token '+token,'Content-Type':file.mime_type},body:bytes});
 if(!res.ok)throw Error('ASR provider rejected audio ('+res.status+')');
 const d=await res.json();
 const alternative=d.results?.channels?.[0]?.alternatives?.[0];const transcript=String(alternative?.transcript||'');
 const providerDuration=Math.round(Number(d.metadata?.duration||0)*1000);
 const words:Array<{start:number;end:number;confidence:number}>=alternative?.words||[];
 const spoken=Math.round(words.reduce((sum,w)=>sum+Math.max(0,(w.end-w.start)*1000),0));
 const similarity=alignment(expected,transcript);
 const confidence=words.length?words.reduce((sum,w)=>sum+Number(w.confidence||0),0)/words.length:0;
 Object.assign(checks,{transcript,similarity,confidence,word_count:words.length,provider_duration_ms:providerDuration,voice_ms:spoken});
 if(providerDuration<750||spoken<650||spoken>providerDuration||similarity<.78||confidence<.65)throw Error('Speech quality criteria were not met');
 return {checks,checksum:digest,duration:providerDuration,spoken,similarity};
}
