import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { MessengerConfig } from './config/index.js'

export type DbClient = SupabaseClient

export function createDb(config: MessengerConfig): DbClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
