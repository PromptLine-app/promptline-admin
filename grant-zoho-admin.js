// One-off: grant admin to a specific email (the account you log in with), and
// optionally deactivate accounts passed via --revoke. Usage:
//   node grant-zoho-admin.js grant ranjit@promptline.app
//   node grant-zoho-admin.js grant ranjit@promptline.app --revoke noreply@promptline.app
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const args = process.argv.slice(2);
const revokeIdx = args.indexOf('--revoke');
const revokeEmails = revokeIdx >= 0 ? args.slice(revokeIdx + 1) : [];
const grantEmails = (revokeIdx >= 0 ? args.slice(0, revokeIdx) : args).filter(
  (a) => a !== 'grant',
);

const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (error) { console.error('listUsers failed:', error.message); process.exit(1); }
const byEmail = (e) => data.users.find((u) => u.email?.toLowerCase() === e.toLowerCase());

for (const email of grantEmails) {
  const u = byEmail(email);
  if (!u) { console.log(`❌ ${email}: no auth user found`); continue; }
  const fullName = u.user_metadata?.full_name || email.split('@')[0];
  const { error: upErr } = await supabase
    .from('admin_users')
    .upsert(
      { auth_user_id: u.id, email, full_name: fullName, role: 'admin', is_active: true },
      { onConflict: 'email' },
    );
  console.log(upErr ? `❌ ${email}: ${upErr.message}` : `✅ granted admin to ${email} (auth_user_id ${u.id})`);
}

for (const email of revokeEmails) {
  const { error: delErr } = await supabase.from('admin_users').delete().eq('email', email);
  console.log(delErr ? `❌ revoke ${email}: ${delErr.message}` : `🚫 removed admin_users row for ${email}`);
}
