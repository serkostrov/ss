import { useMemo } from 'react'

import { permissions, usePermissions } from '@features/auth'
import { useCompanyProductsForModeration } from '@features/company-products'
import { useMaterialCategoriesForModeration } from '@features/material-categories'
import { useMaterialSectionsForModeration } from '@features/materials'
import {
  useProductCategories,
  useProductCategorySuggestions,
} from '@features/product-categories'
import { useRegistrationApplications } from '@features/registrations'
import { useWorkGroupMembershipRequests } from '@features/work-groups'
import { routes } from '@shared/config'

import type {
  ModerationFeedItem,
  ModerationFeedKindFilter,
  ModerationFeedStatusFilter,
} from './types'

function matchesStatus(
  status: ModerationFeedItem['status'],
  filter: ModerationFeedStatusFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'pending') return status === 'pending'
  return status !== 'pending'
}

export function useModerationFeed(
  statusFilter: ModerationFeedStatusFilter,
  kindFilter: ModerationFeedKindFilter,
  search: string,
) {
  const { can } = usePermissions()
  const canRegistrations = can(permissions['admin.registrations'])
  const canCompanies = can(permissions['admin.companies'])
  const canMaterials = can(permissions['admin.materials'])
  const canWorkGroups = can(permissions['admin.workGroups'])

  const registrations = useRegistrationApplications({ status: 'all' })
  const products = useCompanyProductsForModeration('all')
  const productSuggestions = useProductCategorySuggestions('all')
  const productCategories = useProductCategories()
  const materials = useMaterialSectionsForModeration('all')
  const materialCategories = useMaterialCategoriesForModeration('all')
  const membershipRequests = useWorkGroupMembershipRequests('all')

  const activeQueries = [
    canRegistrations ? registrations : null,
    canCompanies ? products : null,
    canCompanies ? productSuggestions : null,
    canMaterials ? materials : null,
    canMaterials ? materialCategories : null,
    canWorkGroups ? membershipRequests : null,
  ].filter(Boolean)

  const isLoading = activeQueries.some((query) => query?.isLoading && !query.data)
  const isError = activeQueries.some((query) => query?.isError)
  const error = activeQueries.find((query) => query?.isError)?.error

  const refetch = async () => {
    await Promise.all(activeQueries.map((query) => query?.refetch()))
  }

  const allItems = useMemo(() => {
    const next: ModerationFeedItem[] = []

    if (canRegistrations) {
      for (const row of registrations.data ?? []) {
        next.push({
          id: `registration:${row.id}`,
          kind: 'registration',
          title: row.full_name || 'Без имени',
          subtitle: [
            row.company_name_hint || row.representative?.company?.name || 'Компания не указана',
            row.position_hint,
            row.email,
          ]
            .filter(Boolean)
            .join(' · '),
          meta: row.phone || undefined,
          status: row.status,
          sortAt: row.created_at,
          rawId: row.id,
        })
      }
    }

    if (canCompanies) {
      const mergedSuggestionIds = new Set<string>()

      for (const row of products.data ?? []) {
        const pendingSuggestion = row.pendingSuggestion
        if (pendingSuggestion) mergedSuggestionIds.add(pendingSuggestion.id)

        const noteLabel =
          row.note?.name ??
          (row.proposed_note_name
            ? `предложение: ${row.proposed_note_name}`
            : pendingSuggestion
              ? `+ категория «${pendingSuggestion.suggested_name}»`
              : null)

        const okpdLabel = row.proposed_okpd_code
          ? `${row.proposed_okpd_code} — ${row.proposed_okpd_title ?? ''}`
          : row.okpd
            ? `${row.okpd.code} — ${row.okpd.title}`
            : null

        next.push({
          id: `product:${row.id}`,
          kind: 'product',
          title: row.name,
          subtitle: [
            row.company?.name ?? 'Компания',
            okpdLabel,
            noteLabel,
            row.proposed_okpd_code ? 'новый ОКПД → в справочник' : null,
          ]
            .filter(Boolean)
            .join(' · '),
          meta: row.url || undefined,
          href: routes.admin.product(row.id),
          status: row.moderation_status,
          sortAt: row.created_at,
          rawId: row.id,
          linkedSuggestionId: pendingSuggestion?.id,
          suggestedCategoryName: pendingSuggestion?.suggested_name,
        })
      }

      // Standalone category proposals only (not already folded into a product card).
      for (const row of productSuggestions.data ?? []) {
        if (mergedSuggestionIds.has(row.id)) continue

        next.push({
          id: `productCategory:${row.id}`,
          kind: 'productCategory',
          title: row.suggested_name,
          subtitle: [row.company?.name ?? 'Компания', row.product?.name ?? 'Продукция'].join(
            ' · ',
          ),
          meta: row.suggestedBy?.full_name || row.suggestedBy?.email || undefined,
          status: row.status,
          sortAt: row.created_at,
          rawId: row.id,
        })
      }
    }

    if (canMaterials) {
      for (const row of materials.data ?? []) {
        next.push({
          id: `material:${row.id}`,
          kind: 'material',
          title: row.title,
          subtitle: [
            row.category?.name ?? 'Без категории',
            row.levels.length
              ? row.levels.map((level) => level.name).join(', ')
              : 'уровни не заданы',
          ].join(' · '),
          meta: row.description || undefined,
          href: routes.admin.material(row.id),
          status: row.moderation_status,
          sortAt: row.updated_at,
          canApprove: row.level_ids.length > 0,
          rawId: row.id,
        })
      }

      for (const row of materialCategories.data ?? []) {
        next.push({
          id: `materialCategory:${row.id}`,
          kind: 'materialCategory',
          title: row.name,
          subtitle: `slug: ${row.slug}`,
          status: row.moderation_status,
          sortAt: row.created_at,
          rawId: row.id,
        })
      }
    }

    if (canWorkGroups) {
      for (const row of membershipRequests.data ?? []) {
        const kindLabel = row.kind === 'join' ? 'Вступление' : 'Выход'
        next.push({
          id: `workGroupMembership:${row.id}`,
          kind: 'workGroupMembership',
          title: row.workGroup?.name ?? 'Рабочая группа',
          subtitle: [
            kindLabel,
            row.company?.name ?? 'Компания',
            row.representative?.full_name || row.representative?.email || null,
          ]
            .filter(Boolean)
            .join(' · '),
          href: row.work_group_id ? routes.admin.workGroup(row.work_group_id) : undefined,
          status: row.status,
          sortAt: row.created_at,
          rawId: row.id,
        })
      }
    }

    next.sort((a, b) => +new Date(b.sortAt) - +new Date(a.sortAt))
    return next
  }, [
    canCompanies,
    canMaterials,
    canRegistrations,
    canWorkGroups,
    materialCategories.data,
    materials.data,
    membershipRequests.data,
    productSuggestions.data,
    products.data,
    registrations.data,
  ])

  const statusScoped = useMemo(
    () => allItems.filter((item) => matchesStatus(item.status, statusFilter)),
    [allItems, statusFilter],
  )

  const counts = useMemo(() => {
    const base: Record<ModerationFeedKindFilter, number> = {
      all: statusScoped.length,
      registration: 0,
      product: 0,
      productCategory: 0,
      material: 0,
      materialCategory: 0,
      workGroupMembership: 0,
    }
    for (const item of statusScoped) base[item.kind] += 1
    return base
  }, [statusScoped])

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return statusScoped.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false
      if (!needle) return true
      return [item.title, item.subtitle, item.meta]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [kindFilter, search, statusScoped])

  return {
    items,
    counts,
    isLoading,
    isError,
    error,
    refetch,
    productCategories: productCategories.data ?? [],
    pendingTotal: allItems.filter((item) => item.status === 'pending').length,
  }
}
