import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase env variables. Check .env file.');
}

/** Auth client — uses the anon key for login/signup flows. */
export const supabaseAuth = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Service client — uses the service role key for reading all tables
 * (billing, tenant_plan, etc. that are service-role only via RLS).
 * Only used in this internal admin dashboard.
 */
export const supabase = createClient(supabaseUrl || '', supabaseServiceKey || supabaseAnonKey || '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
