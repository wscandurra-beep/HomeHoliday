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
  id?:string;
  user_id:string;
  workspace_id:string;
  listing_key:string;
  flag:string;
  note:string;
  updated_at:string;
};

export type Workspace={
  id:string;
  name:string;
  owner_id:string;
  created_at:string;
};

export type WorkspaceMember={
  workspace_id:string;
  user_id:string;
  email:string;
  role:'owner'|'member';
  joined_at:string;
};
