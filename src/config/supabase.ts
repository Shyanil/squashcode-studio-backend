import { createClient } from '@supabase/supabase-js';

import { env } from '@/config/env';
import { getSupabaseRequestAccessToken } from '@/supabase/requestContext';

const fetchWithRequestAuth: typeof fetch = (input, init) => {
  const accessToken = getSupabaseRequestAccessToken();

  if (!accessToken) {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
};

export function createSupabaseClient() {
  const supabaseKey = env.supabaseServiceRoleKey || env.supabaseAnonKey;

  if (!env.supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(env.supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithRequestAuth,
    },
  });
}

export function createSupabaseAdminClient() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
