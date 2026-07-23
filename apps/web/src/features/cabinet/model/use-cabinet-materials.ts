import { useDeferredValue, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  materialsService,
  queryKeys,
  useSupabaseQuery,
  type CabinetMaterial,
} from '@shared/api'
import { appConfig } from '@shared/config'

/** Cabinet materials stay fresh longer — list is RLS-scoped and changes rarely. */
export const CABINET_MATERIALS_STALE_MS = Math.max(appConfig.api.staleTimeMs, 5 * 60_000)
export const CABINET_MATERIALS_GC_MS = 30 * 60_000

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function filterCabinetMaterials(
  items: CabinetMaterial[],
  search: string,
): CabinetMaterial[] {
  const q = normalizeSearch(search)
  if (!q) return items
  return items.filter((item) => {
    const haystack = [item.title, item.description ?? '', item.slug ?? '']
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

export function useCabinetMaterials() {
  return useSupabaseQuery(
    queryKeys.materials.cabinetList,
    () => materialsService.listForMember(),
    {
      ensureFreshSession: true,
      staleTime: CABINET_MATERIALS_STALE_MS,
      gcTime: CABINET_MATERIALS_GC_MS,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useCabinetMaterialsSearch(search: string) {
  const query = useCabinetMaterials()
  const deferredSearch = useDeferredValue(search)
  const filtered = useMemo(
    () => filterCabinetMaterials(query.data ?? [], deferredSearch),
    [query.data, deferredSearch],
  )

  return {
    ...query,
    search: deferredSearch,
    items: filtered,
    totalCount: query.data?.length ?? 0,
    isFiltering: deferredSearch !== search,
  }
}

export function useCabinetMaterialBySlug(slug: string | undefined) {
  const queryClient = useQueryClient()

  return useSupabaseQuery(
    queryKeys.materials.cabinetBySlug(slug ?? 'none'),
    () => {
      if (!slug) return Promise.resolve(null)
      return materialsService.getForMemberBySlug(slug)
    },
    {
      enabled: Boolean(slug),
      ensureFreshSession: true,
      staleTime: CABINET_MATERIALS_STALE_MS,
      gcTime: CABINET_MATERIALS_GC_MS,
      meta: { suppressErrorToast: true },
      placeholderData: () => {
        if (!slug) return undefined
        const list = queryClient.getQueryData<CabinetMaterial[]>(queryKeys.materials.cabinetList)
        const fromList = list?.find((item) => item.slug === slug || item.id === slug)
        if (!fromList) return undefined
        return { ...fromList, content: fromList.content ?? null }
      },
    },
  )
}

export function usePrefetchCabinetMaterial() {
  const queryClient = useQueryClient()

  return (slug: string | null | undefined) => {
    const normalized = slug?.trim().toLowerCase()
    if (!normalized) return

    void queryClient.prefetchQuery({
      queryKey: queryKeys.materials.cabinetBySlug(normalized),
      queryFn: () => materialsService.getForMemberBySlug(normalized),
      staleTime: CABINET_MATERIALS_STALE_MS,
    })
  }
}

export type { CabinetMaterial }
