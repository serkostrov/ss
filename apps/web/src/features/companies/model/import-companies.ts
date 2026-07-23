import { z } from 'zod'

import type { Json } from '@shared/api'

/** Normalize spreadsheet header aliases → canonical keys. */
const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  название: 'name',
  компания: 'name',
  организация: 'name',
  'наименование организации': 'name',
  inn: 'inn',
  инн: 'inn',
  access_status: 'access_status',
  статус: 'access_status',
  'статус доступа': 'access_status',
  participation_level: 'participation_level',
  уровень: 'participation_level',
  'уровень участия': 'participation_level',
  phone: 'phone',
  телефон: 'phone',
  email: 'email',
  'e-mail': 'email',
  почта: 'email',
  website: 'website',
  сайт: 'website',
  address: 'address',
  адрес: 'address',
  description: 'description',
  описание: 'description',
  notes: 'notes',
  заметки: 'notes',
  примечание: 'notes',
}

export type CompanyImportRow = {
  name: string
  inn?: string
  access_status?: string
  participation_level?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  description?: string
  notes?: string
}

export type CompanyImportResult = {
  created: number
  updated: number
  skipped: number
  errors: Array<{ row?: number; error?: string; message?: string; inn?: string }>
}

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase().replace(/\s+/g, ' ')
  return HEADER_ALIASES[key] ?? key
}

export function mapSpreadsheetRowsToCompanyImport(
  rows: Record<string, string>[],
): CompanyImportRow[] {
  const result: CompanyImportRow[] = []
  for (const row of rows) {
    const mapped: Record<string, string> = {}
    for (const [header, value] of Object.entries(row)) {
      const key = normalizeHeader(header)
      if (!mapped[key] && value) mapped[key] = value
    }
    const name = mapped.name?.trim() ?? ''
    if (!name) continue
    result.push({
      name,
      inn: mapped.inn,
      access_status: mapped.access_status,
      participation_level: mapped.participation_level,
      phone: mapped.phone,
      email: mapped.email,
      website: mapped.website,
      address: mapped.address,
      description: mapped.description,
      notes: mapped.notes,
    })
  }
  return result
}

export function companyImportRowsToJson(rows: CompanyImportRow[]): Json {
  return rows as unknown as Json
}

export function parseCompanyImportResult(value: unknown): CompanyImportResult {
  const schema = z.object({
    created: z.number(),
    updated: z.number(),
    skipped: z.number(),
    errors: z
      .array(
        z.object({
          row: z.number().optional(),
          error: z.string().optional(),
          message: z.string().optional(),
          inn: z.string().optional(),
        }),
      )
      .default([]),
  })
  return schema.parse(value)
}
