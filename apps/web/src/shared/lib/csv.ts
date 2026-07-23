/**
 * Build and download a CSV file (UTF-8 with BOM, `;` delimiter for Excel ru).
 */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined) => {
    const cell = value == null ? '' : String(value)
    if (/[";\n\r]/.test(cell)) {
      return `"${cell.replace(/"/g, '""')}"`
    }
    return cell
  }

  return `\uFEFF${rows.map((row) => row.map(escape).join(';')).join('\r\n')}`
}

export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const safeName = filename.trim() || 'export.csv'
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeName.endsWith('.csv') ? safeName : `${safeName}.csv`
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function slugifyFilename(value: string, fallback = 'export'): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || fallback
}
