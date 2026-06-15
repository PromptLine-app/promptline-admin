import { supabaseAuth } from '@/config/supabase';

/**
 * Call an /api/admin/* serverless route with the current admin's session bearer
 * token. These routes hold the service-role key and perform privileged GoTrue
 * operations (impersonation magic-links, creating/deleting admin auth users) that
 * can't run from the browser session. The server re-checks the token against
 * admin_users, so this is authorization, not just convenience.
 */
export async function adminApi<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const { data } = await supabaseAuth.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: method !== 'GET' && body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error || `Request failed (${res.status})`);
  return json as T;
}
