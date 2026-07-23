import {
  AUDIT_EXPORT_MAX_ROWS,
  auditService,
  queryKeys,
  useSupabaseQuery,
  type AuditLogEntry,
  type AuditLogListFilters,
} from '@shared/api'
import { downloadCsv, slugifyFilename } from '@shared/lib/csv'
import { notify } from '@shared/lib/notify'

import { auditActorLabel, formatAuditDate, formatAuditPayload } from './schemas'

function listKey(filters: AuditLogListFilters) {
  return queryKeys.audit.list({
    search: filters.search?.trim() || '',
    action: filters.action ?? 'all',
    entityType: filters.entityType ?? 'all',
    userId: filters.userId ?? 'all',
    from: filters.from ?? '',
    to: filters.to ?? '',
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  })
}

export function useAuditLog(filters: AuditLogListFilters) {
  return useSupabaseQuery(listKey(filters), () => auditService.list(filters), {
    ensureFreshSession: true,
    meta: { suppressErrorToast: true },
  })
}

export function useAuditActionOptions() {
  return useSupabaseQuery(
    queryKeys.audit.actionOptions,
    () => auditService.listActionOptions(),
    {
      ensureFreshSession: true,
      staleTime: 60_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useAuditEntityTypeOptions() {
  return useSupabaseQuery(
    queryKeys.audit.entityTypeOptions,
    () => auditService.listEntityTypeOptions(),
    {
      ensureFreshSession: true,
      staleTime: 60_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function buildAuditCsvRows(entries: AuditLogEntry[]): Array<Array<string | number>> {
  return [
    ['Когда', 'Действие', 'Сущность', 'ID сущности', 'Актор', 'Email', 'Payload'],
    ...entries.map((entry) => [
      formatAuditDate(entry.created_at),
      entry.action,
      entry.entity_type,
      entry.entity_id ?? '',
      auditActorLabel(entry),
      entry.actor?.email ?? '',
      formatAuditPayload(entry.payload),
    ]),
  ]
}

export async function exportAuditLogCsv(filters: AuditLogListFilters) {
  const rows = await auditService.listForExport(filters)
  downloadCsv(
    `audit-log-${slugifyFilename(new Date().toISOString().slice(0, 10), 'export')}`,
    buildAuditCsvRows(rows),
  )
  notify.success(
    rows.length >= AUDIT_EXPORT_MAX_ROWS
      ? `Экспорт: первые ${AUDIT_EXPORT_MAX_ROWS} записей`
      : `Экспорт: ${rows.length} записей`,
  )
}

export type { AuditLogEntry }
