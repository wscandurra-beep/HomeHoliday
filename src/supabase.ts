import { createClient } from '@supabase/supabase-js';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigured=Boolean(supabaseUrl&&supabasePublishableKey);
export const supabase=supabaseConfigured
  ? createClient(supabaseUrl!,supabasePublishableKey!,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    })
  : null;

export type CloudAnnotationRow={
  user_id:string;
  listing_key:string;
  flag:string;
  note:string;
  updated_at:string;
};
