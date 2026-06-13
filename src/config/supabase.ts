import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase env variables. Check .env file.');
}

/**
 * Single browser client — authenticates the admin (login/signup) AND reads/writes
 * data as that signed-in admin via their session.
 *
 * It uses the public anon key only. The SERVICE-ROLE key is never shipped to the
 * browser; instead, czqth RLS (`admin_dash_*` policies + is_active_admin /
 * is_admin_writer) grants active admin_users rows access to exactly the tables
 * this dashboard touches. Privileged GoTrue operations that genuinely need the
 * service key (impersonation magic-links, creating/deleting admin auth users)
 * live in the /api/admin/* serverless routes — see src/lib/adminApi.ts.
 */
export const supabaseAuth = createClient(supabaseUrl || '', supabaseAnonKey || '');

/** Back-compat alias: data access now runs as the signed-in admin, not service role. */
export const supabase = supabaseAuth;
