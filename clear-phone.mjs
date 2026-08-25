import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://czqthypzgxybkprdptzg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6cXRoeXB6Z3h5YmtwcmRwdHpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0NzMyNywiZXhwIjoyMDk0NTIzMzI3fQ.9EEtbwSe9eda3Ohyn8R0TwQWKficGhMpn4BNSBGTgj4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const targetPhone = '7087738250';

async function run() {
  console.log(`Searching for phone ${targetPhone}...`);
  
  // Update tenants table
  const { data: tData, error: tErr } = await supabase
    .from('tenants')
    .update({ twillio_phone: null })
    .eq('twillio_phone', targetPhone)
    .select('id, company_name');
    
  if (tErr) console.error('Error updating tenants:', tErr.message);
  else console.log('Cleared from tenants:', tData);
  
  // Update operational profiles
  const { data: opData, error: opErr } = await supabase
    .from('tenant_operational_profiles')
    .update({ twillio_phone: null })
    .eq('twillio_phone', targetPhone)
    .select('tenant_id');
    
  if (opErr) console.error('Error updating ops:', opErr.message);
  else console.log('Cleared from operational profiles:', opData);
}

run();
