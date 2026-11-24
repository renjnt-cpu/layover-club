import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'layover-club-auth' },
});

// A failed call never turns into a guess. Network trouble becomes the exact wording the brief asks for,
// and the screens treat it as "do not give the discount".
export class OfflineError extends Error {}

function friendly(e) {
  let m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
    const err = new OfflineError('Unable to verify membership. Internet/database connection required.');
    return err;
  }
  if (/JWT expired|invalid JWT/i.test(m)) m = 'Your session ended. Please sign in again.';
  if (/permission denied|do not have access/i.test(m)) m = 'You do not have access to this.';
  const err = new Error(m);
  err.code = e && e.code;
  return err;
}

export async function rpc(fn, args = {}) {
  let res;
  try { res = await sb.rpc(fn, args); } catch (e) { throw friendly(e); }
  if (res.error) throw friendly(res.error);
  return res.data;
}
