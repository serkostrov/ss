import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { appConfig, env } from '@shared/config'

import { assertBrowserSafeKeys } from '../lib/security'
import type { Database } from '../types/database'

export type TypedSupabaseClient = SupabaseClient<Database>

assertBrowserSafeKeys({
  supabaseUrl: env.supabaseUrl,
  supabaseAnonKey: env.supabaseAnonKey,
})

/**
 * Internal typed browser client.
 * Do not import outside `shared/api/services/*`.
 */
export const supabaseClient: TypedSupabaseClient = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      persistSession: appConfig.auth.persistSession,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'apss-auth',
    },
    global: {
      headers: {
        'x-client-info': 'apss-web',
      },
    },
  },
)
