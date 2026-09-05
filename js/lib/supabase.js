import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

async function fetchWithTimeout(input, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  if (options.signal?.aborted) controller.abort();
  else if (options.signal) options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  try { return await fetch(input, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: fetchWithTimeout }
});
