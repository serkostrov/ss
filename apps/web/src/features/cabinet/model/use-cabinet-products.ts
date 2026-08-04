import { useMemo } from 'react'

import type { DirectoryCompany, DirectoryProduct } from '@shared/api'

import { useAssociationDirectory } from './use-cabinet-company'

export type CabinetCatalogProduct = DirectoryProduct & {
  companyId: string
  companyName: string
  companyWebsite: string | null
  companyDescription: string | null
  participationLevelName: string | null
}

export type CabinetCatalogCompanyGroup = {
  companyId: string
  companyName: string
  companyWebsite: string | null
  companyDescription: string | null
  participationLevelName: string | null
  products: CabinetCatalogProduct[]
}

export type CabinetProductsFilters = {
  search?: string
  okpdCodeId?: string
  noteId?: string
  companyId?: string
}

function flattenProducts(companies: DirectoryCompany[]): CabinetCatalogProduct[] {
  const items: CabinetCatalogProduct[] = []
  for (const company of companies) {
    for (const product of company.products) {
      items.push({
        ...product,
        companyId: company.id,
        companyName: company.name,
        companyWebsite: company.website,
        companyDescription: company.description,
        participationLevelName: company.participation_level_name,
      })
    }
  }
  return items
}

function groupByCompany(products: CabinetCatalogProduct[]): CabinetCatalogCompanyGroup[] {
  const groups = new Map<string, CabinetCatalogCompanyGroup>()

  for (const product of products) {
    const existing = groups.get(product.companyId)
    if (existing) {
      existing.products.push(product)
      continue
    }
    groups.set(product.companyId, {
      companyId: product.companyId,
      companyName: product.companyName,
      companyWebsite: product.companyWebsite,
      companyDescription: product.companyDescription,
      participationLevelName: product.participationLevelName,
      products: [product],
    })
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      products: [...group.products].sort((a, b) =>
        (a.okpd_code ?? a.name).localeCompare(b.okpd_code ?? b.name, 'ru'),
      ),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ru'))
}

export function useCabinetProductsCatalog(filters: CabinetProductsFilters = {}) {
  const query = useAssociationDirectory('')
  const allProducts = useMemo(() => flattenProducts(query.data ?? []), [query.data])

  const okpdOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of allProducts) {
      if (product.okpd_code_id && product.okpd_code) {
        map.set(
          product.okpd_code_id,
          `${product.okpd_code}${product.okpd_title ? ` — ${product.okpd_title}` : ''}`,
        )
      }
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [allProducts])

  const noteOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of allProducts) {
      if (product.note_id && product.note_name) {
        map.set(product.note_id, product.note_name)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [allProducts])

  const companies = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of allProducts) {
      map.set(product.companyId, product.companyName)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [allProducts])

  const items = useMemo(() => {
    const term = filters.search?.trim().toLowerCase() ?? ''
    const okpdCodeId = filters.okpdCodeId ?? 'all'
    const noteId = filters.noteId ?? 'all'
    const companyId = filters.companyId ?? 'all'

    return allProducts.filter((product) => {
      if (okpdCodeId !== 'all' && product.okpd_code_id !== okpdCodeId) return false
      if (noteId === 'none' && product.note_id) return false
      if (noteId !== 'all' && noteId !== 'none' && product.note_id !== noteId) return false
      if (companyId !== 'all' && product.companyId !== companyId) return false
      if (!term) return true
      const haystack = [
        product.name,
        product.okpd_code,
        product.okpd_title,
        product.note_name,
        product.category_name,
        product.companyName,
        product.companyDescription,
        product.participationLevelName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [allProducts, filters.search, filters.okpdCodeId, filters.noteId, filters.companyId])

  const groups = useMemo(() => groupByCompany(items), [items])

  return {
    ...query,
    items,
    groups,
    totalCount: allProducts.length,
    companyCount: companies.length,
    okpdOptions,
    noteOptions,
    companies,
  }
}

export function useCabinetProduct(productId: string | undefined) {
  const query = useAssociationDirectory('')
  const product = useMemo(() => {
    if (!productId) return null
    const products = flattenProducts(query.data ?? [])
    return products.find((item) => item.id === productId) ?? null
  }, [productId, query.data])

  return {
    ...query,
    product,
  }
}
