export type ModerationFeedKind =
  | 'registration'
  | 'product'
  | 'productCategory'
  | 'material'
  | 'materialCategory'
  | 'workGroupMembership'

export type ModerationFeedStatusFilter = 'pending' | 'resolved' | 'all'

export type ModerationFeedKindFilter = ModerationFeedKind | 'all'

export type ModerationFeedItem = {
  id: string
  kind: ModerationFeedKind
  title: string
  subtitle: string
  meta?: string
  href?: string
  status: 'pending' | 'approved' | 'rejected' | 'confirmed' | 'blocked'
  sortAt: string
  /** Disable approve when levels missing, etc. */
  canApprove?: boolean
  rawId: string
  /** Pending category proposal linked to this product — one feed card. */
  linkedSuggestionId?: string
  suggestedCategoryName?: string
}
