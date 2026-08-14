import { useMemo } from 'react'

import {
  levelResourceAccessService,
  queryKeys,
  useSupabaseQuery,
  type CabinetResource,
  type CabinetResourceAccess,
} from '@shared/api'

export type CabinetResourceAccessMap = Record<
  CabinetResource,
  { visible: boolean; hasContent: boolean }
>

export const cabinetNavResourceById: Record<string, CabinetResource | undefined> = {
  directory: 'directory',
  products: 'products',
  materials: 'materials',
  polls: 'polls',
  workGroups: 'work_groups',
  invoices: 'invoices',
}

function toAccessMap(rows: CabinetResourceAccess[]): CabinetResourceAccessMap {
  return rows.reduce((acc, row) => {
    acc[row.resource] = { visible: row.visible, hasContent: row.hasContent }
    return acc
  }, {} as CabinetResourceAccessMap)
}

export function useCabinetResourceAccess() {
  const query = useSupabaseQuery(
    queryKeys.cabinet.resourceAccess,
    () => levelResourceAccessService.getCabinetAccess(),
    {
      ensureFreshSession: true,
      staleTime: 30_000,
      meta: { suppressErrorToast: true },
    },
  )

  const map = useMemo(
    () => (query.data ? toAccessMap(query.data) : undefined),
    [query.data],
  )

  return { ...query, map }
}

export function isCabinetNavItemVisible(
  navId: string,
  map: CabinetResourceAccessMap | undefined,
): boolean {
  const resource = cabinetNavResourceById[navId]
  if (!resource) return true
  return map?.[resource]?.visible ?? true
}

export function cabinetResourceForNavId(navId: string): CabinetResource | undefined {
  return cabinetNavResourceById[navId]
}
