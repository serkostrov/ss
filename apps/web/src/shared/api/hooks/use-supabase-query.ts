import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'

import { toApiError } from '@shared/lib/errors'

import { authService } from '../services/auth.service'

type ServiceQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  'queryKey' | 'queryFn'
> & {
  /** Refresh session before the request when token is close to expiry */
  ensureFreshSession?: boolean
}

type ServiceMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables, unknown>,
  'mutationFn'
> & {
  ensureFreshSession?: boolean
  invalidateKeys?: QueryKey[]
}

async function withSessionGuard<T>(
  operation: () => Promise<T>,
  ensureFreshSession?: boolean,
): Promise<T> {
  try {
    if (ensureFreshSession) {
      await authService.ensureFreshSession()
    }
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

/**
 * Universal query hook — always pass a service-layer function as queryFn.
 */
export function useSupabaseQuery<TData>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: ServiceQueryOptions<TData>,
) {
  const { ensureFreshSession, ...queryOptions } = options ?? {}

  return useQuery({
    queryKey,
    queryFn: () => withSessionGuard(queryFn, ensureFreshSession),
    ...queryOptions,
  })
}

/**
 * Universal mutation hook — invalidates keys and normalizes errors.
 */
export function useSupabaseMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: ServiceMutationOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient()
  const { ensureFreshSession, invalidateKeys, ...mutationOptions } = options ?? {}

  return useMutation({
    mutationFn: (variables: TVariables) =>
      withSessionGuard(() => mutationFn(variables), ensureFreshSession),
    ...mutationOptions,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (invalidateKeys?.length) {
        await Promise.all(invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })))
      }
      await mutationOptions.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}
