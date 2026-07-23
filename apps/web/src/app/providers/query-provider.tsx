import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { triggerUnauthorizedRedirect } from '@app/lib/unauthorized-redirect'
import { appConfig } from '@shared/config'
import { isUnauthorizedError, toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

type QueryProviderProps = {
  children: ReactNode
}

function shouldToastQueryError(error: unknown): boolean {
  const apiError = toApiError(error)
  if (apiError.code === 'aborted') return false
  if (apiError.code === 'unauthorized') return false
  return true
}

function handleGlobalError(error: unknown) {
  if (isUnauthorizedError(error)) {
    triggerUnauthorizedRedirect()
  }
}

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        handleGlobalError(error)
        const meta = query.meta as { suppressErrorToast?: boolean } | undefined
        if (meta?.suppressErrorToast) return
        if (!shouldToastQueryError(error)) return
        notify.fromError(error, 'Не удалось загрузить данные')
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        handleGlobalError(error)
        const meta = mutation.meta as { suppressErrorToast?: boolean } | undefined
        if (meta?.suppressErrorToast) return
        if (!shouldToastQueryError(error)) return
        notify.fromError(error, 'Не удалось выполнить действие')
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: appConfig.api.staleTimeMs,
        retry: (failureCount, error) => {
          const apiError = toApiError(error)
          if (!apiError.isRetryable) return false
          if (apiError.code === 'unauthorized' || apiError.code === 'forbidden') return false
          return failureCount < appConfig.api.queryRetry
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: appConfig.api.mutationRetry,
      },
    },
  })
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = useState(createQueryClient)

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
