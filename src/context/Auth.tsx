import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase,configured } from '../lib/core';
type Identity={user:User|null;loading:boolean;admin:boolean;refresh:()=>Promise<void>};
const Context=createContext<Identity>({user:null,loading:true,admin:false,refresh:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [admin,setAdmin]=useState(false);const [loading,setLoading]=useState(true);
async function refresh(){if(!configured){setLoading(false);return;} const {data}=await supabase.auth.getUser();setUser(data.user);if(data.user){const result=await supabase.from('user_roles').select('role').eq('user_id',data.user.id).eq('role','admin').maybeSingle();setAdmin(!!result.data);}else setAdmin(false);setLoading(false);}
useEffect(()=>{void refresh();const {data}=supabase.auth.onAuthStateChange(()=>{void refresh();});return ()=>data.subscription.unsubscribe();},[]);
return <Context.Provider value={{user,admin,loading,refresh}}>{children}</Context.Provider>;}
export const useAuth=()=>useContext(Context);
