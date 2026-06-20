import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket }
});

async function main() {
  console.log("Checking cafeteria full profile...");
  const { data: tenant, error: err1 } = await supabase.from('tenants').select('*, tenant_operational_profiles(*), tenant_voice_profiles(*)').eq('id', '11944b9f-1326-417d-b97f-4c69505fbc6f').maybeSingle();
  if (err1) {
    console.error("Error fetching cafeteria:", err1);
    return;
  }
  console.log("Tenant:", tenant);
}

main();
