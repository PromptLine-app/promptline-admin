import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

import WebSocket from 'ws';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Role Key in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket }
});

const OLD_EMAIL = 'Wadodkarshantanu@promptline.app';
const NEW_EMAIL = 'shantanu@promptline.app';
const PASSWORD = 'admin123';
const FULL_NAME = 'Shantanu';

async function updateAccess() {
  console.log(`Starting to replace ${OLD_EMAIL} with ${NEW_EMAIL}...`);

  // 1. Delete from admin_users table first
  const { error: dbDeleteError } = await supabase
    .from('admin_users')
    .delete()
    .ilike('email', OLD_EMAIL);
    
  if (dbDeleteError) {
    console.error(`Error removing from admin_users: ${dbDeleteError.message}`);
  } else {
    console.log(`✅ Removed ${OLD_EMAIL} from admin_users table.`);
  }

  // 2. Delete from auth.users
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error(`Error listing users: ${listError.message}`);
  } else {
    const oldUser = usersData.users.find(u => u.email?.toLowerCase() === OLD_EMAIL.toLowerCase());
    if (oldUser) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(oldUser.id);
      if (authDeleteError) {
        console.error(`Error deleting auth user: ${authDeleteError.message}`);
      } else {
        console.log(`✅ Deleted ${OLD_EMAIL} from authentication system.`);
      }
    } else {
      console.log(`⚠️ User ${OLD_EMAIL} not found in authentication system.`);
    }
  }

  // 3. Create the new user
  let newUserId;
  const existingNewUser = usersData?.users.find(u => u.email?.toLowerCase() === NEW_EMAIL.toLowerCase());
  
  if (!existingNewUser) {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: NEW_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME }
    });

    if (createError) {
      console.error(`Failed to create ${NEW_EMAIL}:`, createError.message);
      process.exit(1);
    }
    newUserId = newUser.user.id;
    console.log(`✅ Created new auth user ${NEW_EMAIL} with ID: ${newUserId}`);
  } else {
    newUserId = existingNewUser.id;
    console.log(`✅ User ${NEW_EMAIL} already exists in auth.users. Updating password...`);
    await supabase.auth.admin.updateUserById(newUserId, { password: PASSWORD });
  }

  // 4. Add new user to admin_users table
  const { error: insertError } = await supabase
    .from('admin_users')
    .upsert({
      auth_user_id: newUserId,
      email: NEW_EMAIL,
      full_name: FULL_NAME,
      role: 'admin',
      is_active: true
    }, { onConflict: 'email' });

  if (insertError) {
    console.error(`Failed to add ${NEW_EMAIL} to admin_users:`, insertError.message);
  } else {
    console.log(`✅ Assigned admin role to ${NEW_EMAIL}`);
  }

  console.log('\n🎉 Finished updating access!');
}

updateAccess();
