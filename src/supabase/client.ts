import { createSupabaseAdminClient, createSupabaseClient } from '@/config/supabase';

export const supabaseAdminClient = createSupabaseAdminClient();
export const supabaseClient = createSupabaseClient();
