import '@tanstack/react-query'

export type QueryMeta = {
  /** Skip global error toasts for this query/mutation */
  suppressErrorToast?: boolean
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta
    mutationMeta: QueryMeta
  }
}
