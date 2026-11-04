import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase,configured } from '../lib/core';
type Identity={user:User|null;loading:boolean;admin:boolean;active:boolean;refresh:()=>Promise<void>};
const Context=createContext<Identity>({user:null,loading:true,admin:false,active:true,refresh:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [admin,setAdmin]=useState(false);const [active,setActive]=useState(true);const [loading,setLoading]=useState(true);
async function refresh(){if(!configured){setLoading(false);return;} const {data}=await supabase.auth.getUser();setUser(data.user);if(data.user){const [result,profile]=await Promise.all([supabase.rpc('is_admin'),supabase.from('profiles').select('status').eq('id',data.user.id).maybeSingle()]);setAdmin(result.data===true);setActive(profile.data?.status==='active');}else{setAdmin(false);setActive(true)};setLoading(false);}
useEffect(()=>{void refresh();const {data}=supabase.auth.onAuthStateChange(()=>{void refresh();});return ()=>data.subscription.unsubscribe();},[]);
return <Context.Provider value={{user,admin,active,loading,refresh}}>{children}</Context.Provider>;}
export const useAuth=()=>useContext(Context);
