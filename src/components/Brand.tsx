import {useState} from 'react';
export function Brand({compact=false}:{compact?:boolean}){const [failed,setFailed]=useState(false);return <span className="brand">{!failed?<img src="https://i.imgur.com/WMX8ohL.png" alt="VoiceTask" onError={()=>setFailed(true)}/>:<span className="brandFallback"><span aria-hidden>◉</span> {compact?'VT':'VoiceTask'}</span>}</span>}
