import * as XLSX from 'xlsx'

import { downloadCsv, slugifyFilename } from './csv'

export type SpreadsheetCell = string | number | boolean | Date | null | undefined

/**
 * Parse first sheet of an .xlsx / .xls / .csv file into header+row objects.
 * Header names are trimmed; empty trailing rows are dropped.
 */
export async function parseSpreadsheetFile(
  file: File,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { headers: [], rows: [] }
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<SpreadsheetCell[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  if (!matrix.length) {
    return { headers: [], rows: [] }
  }

  const headers = (matrix[0] ?? []).map((cell, index) => {
    const label = String(cell ?? '').trim()
    return label || `column_${index + 1}`
  })

  const rows: Record<string, string>[] = []
  for (const raw of matrix.slice(1)) {
    if (!Array.isArray(raw)) continue
    const row: Record<string, string> = {}
    let hasValue = false
    headers.forEach((header, index) => {
      const value = normalizeCell(raw[index])
      row[header] = value
      if (value) hasValue = true
    })
    if (hasValue) rows.push(row)
  }

  return { headers, rows }
}

function normalizeCell(value: SpreadsheetCell): string {
  if (value == null) return ''
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

/** Download a CSV template that Excel opens correctly (UTF-8 BOM + `;`). */
export function downloadCompaniesImportTemplate(): void {
  downloadCsv(slugifyFilename('shablon-kompanii-apss', 'companies-template'), [
    [
      'name',
      'inn',
      'access_status',
      'participation_level',
      'phone',
      'email',
      'website',
      'address',
      'description',
      'notes',
    ],
    [
      'ООО Пример',
      '7707083893',
      'active',
      'Действительный член',
      '+7 495 000-00-00',
      'info@example.ru',
      'https://example.ru',
      'Москва',
      'Описание',
      '',
    ],
    [
      'АО Вышедшая',
      '7700000000',
      'вышедшие',
      '',
      '',
      '',
      '',
      '',
      '',
      'Импорт из бухгалтерии',
    ],
    [
      'ООО На паузе',
      '7710000000',
      'приостановлена',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ])
}
