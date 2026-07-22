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

function jwtRole(token: string) {
  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const decodedPayload = Buffer.from(payload, 'base64url').toString('utf8');
    const decoded = JSON.parse(decodedPayload) as { role?: unknown };

    return typeof decoded.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

function configuredAnonKey() {
  const explicitAnonKey = env.supabaseAnonKey.trim();

  if (explicitAnonKey) {
    return explicitAnonKey;
  }

  const serviceRoleEnvKey = env.supabaseServiceRoleKey.trim();

  return jwtRole(serviceRoleEnvKey) === 'anon' ? serviceRoleEnvKey : '';
}

function configuredServiceRoleKey() {
  const serviceRoleEnvKey = env.supabaseServiceRoleKey.trim();

  return jwtRole(serviceRoleEnvKey) === 'service_role' ? serviceRoleEnvKey : '';
}

export function createSupabaseClient() {
  const supabaseKey = configuredAnonKey() || configuredServiceRoleKey();

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
  const serviceRoleKey = configuredServiceRoleKey();

  if (!env.supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
