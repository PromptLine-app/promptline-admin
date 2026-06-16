import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Role Key in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket }
});

const EMAILS = [
  'research@promptline.app',
  'Nairranjit@promptline.app',
  'Sarodeprashant@promptline.app',
  'Wadodkarshantanu@promptline.app',
  'Undaleramesh@promptline.app',
  'Vermaneha@promptline.app',
  'Salunkhechaitanya.s@promptline.app',
  'Vgirish.v@promptline.app',
  'Jaltareyashodhan@promptline.app',
  'Bapatatharva@promptline.app'
];
const PASSWORD = 'admin123';

async function createAdminUsers() {
  console.log(`Setting up ${EMAILS.length} admin users...`);

  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users.', listError.message);
    process.exit(1);
  }

  for (const email of EMAILS) {
    console.log(`\nProcessing ${email}...`);
    let user = existingUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    // Extract name from email (e.g., Wadodkarshantanu -> Wadodkar Shantanu)
    const namePart = email.split('@')[0];
    const fullName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    if (!user) {
      console.log('User not found in auth.users, creating...');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (createError) {
        console.error(`Failed to create ${email}:`, createError.message);
        continue;
      }
      user = newUser.user;
      console.log('✅ Created auth user with ID:', user.id);
    } else {
      console.log('✅ User already exists in auth.users. Updating password...');
      await supabase.auth.admin.updateUserById(user.id, { password: PASSWORD });
    }

    const { error: insertError } = await supabase
      .from('admin_users')
      .upsert({
        auth_user_id: user.id,
        email: email,
        full_name: fullName,
        role: 'admin',
        is_active: true
      }, { onConflict: 'email' });

    if (insertError) {
      console.error(`Failed to add ${email} to admin_users:`, insertError.message);
    } else {
      console.log(`✅ Assigned admin role to ${email}`);
    }
  }

  console.log('\n🎉 Finished setting up all admin users!');
}

createAdminUsers();
