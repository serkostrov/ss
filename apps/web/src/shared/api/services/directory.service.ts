import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { Json } from '../types/database'

export type DirectoryRepresentative = {
  id: string
  full_name: string
  position: string | null
  phone: string | null
  email: string | null
  is_primary: boolean
}

export type DirectoryCompany = {
  id: string
  name: string
  inn: string | null
  description: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  participation_level_name: string | null
  representatives: DirectoryRepresentative[]
}

export type CabinetPollAccessHint = {
  ok: boolean
  reason:
    | 'ok'
    | 'not_member'
    | 'not_confirmed'
    | 'no_representative'
    | 'no_company'
    | 'company_inactive'
    | 'no_level'
    | 'no_active_polls'
    | 'level_mismatch'
  company_name?: string
  access_status?: string
  active_total?: number
  matching_count?: number
}

function asObject(value: Json | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asBool(value: unknown): boolean {
  return value === true
}

function mapRepresentative(raw: unknown): DirectoryRepresentative | null {
  const row = asObject(raw as Json)
  if (!row || typeof row.id !== 'string' || typeof row.full_name !== 'string') return null
  return {
    id: row.id,
    full_name: row.full_name,
    position: asString(row.position),
    phone: asString(row.phone),
    email: asString(row.email),
    is_primary: asBool(row.is_primary),
  }
}

function mapCompany(raw: unknown): DirectoryCompany | null {
  const row = asObject(raw as Json)
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null
  const repsRaw = Array.isArray(row.representatives) ? row.representatives : []
  return {
    id: row.id,
    name: row.name,
    inn: asString(row.inn),
    description: asString(row.description),
    phone: asString(row.phone),
    email: asString(row.email),
    website: asString(row.website),
    address: asString(row.address),
    participation_level_name: asString(row.participation_level_name),
    representatives: repsRaw
      .map(mapRepresentative)
      .filter((item): item is DirectoryRepresentative => Boolean(item)),
  }
}

export const directoryService = {
  async list(): Promise<DirectoryCompany[]> {
    const { data, error } = await supabaseClient.rpc('list_association_directory')
    if (error) {
      throw new ApiError(error.message, { code: 'unknown', cause: error })
    }
    if (!Array.isArray(data)) return []
    return data.map(mapCompany).filter((item): item is DirectoryCompany => Boolean(item))
  },
}

export const cabinetPollsMetaService = {
  async getAccessHint(): Promise<CabinetPollAccessHint> {
    const { data, error } = await supabaseClient.rpc('get_cabinet_poll_access_hint')
    if (error) {
      throw new ApiError(error.message, { code: 'unknown', cause: error })
    }
    const row = asObject(data)
    if (!row || typeof row.reason !== 'string') {
      return { ok: false, reason: 'no_active_polls' }
    }
    return {
      ok: row.ok === true,
      reason: row.reason as CabinetPollAccessHint['reason'],
      company_name: asString(row.company_name) ?? undefined,
      access_status: asString(row.access_status) ?? undefined,
      active_total: typeof row.active_total === 'number' ? row.active_total : undefined,
      matching_count: typeof row.matching_count === 'number' ? row.matching_count : undefined,
    }
  },
}
