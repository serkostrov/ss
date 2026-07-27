import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

/**
 * Load monorepo root `.env` (and local overrides) before reading process.env.
 * Safe to call multiple times; does not override already-set process env.
 */
export function loadEnvFiles(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../../../.env'), // repo root when running from apps/messenger/src
    resolve(here, '../../.env'), // dist/ layout: apps/messenger/dist → apps/messenger/.env
    resolve(process.cwd(), '.env'),
  ]

  for (const path of candidates) {
    if (!existsSync(path)) continue
    loadDotenv({ path, override: false })
  }
}
