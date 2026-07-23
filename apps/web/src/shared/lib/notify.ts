import { toast as sonnerToast } from 'sonner'

import { getErrorMessage, toApiError } from '@shared/lib/errors'

export type NotifyOptions = {
  description?: string
  duration?: number
  id?: string | number
}

export const notify = {
  success(message: string, options?: NotifyOptions) {
    return sonnerToast.success(message, options)
  },
  error(message: string, options?: NotifyOptions) {
    return sonnerToast.error(message, options)
  },
  info(message: string, options?: NotifyOptions) {
    return sonnerToast.message(message, options)
  },
  warning(message: string, options?: NotifyOptions) {
    return sonnerToast.warning(message, options)
  },
  dismiss(id?: string | number) {
    sonnerToast.dismiss(id)
  },
  fromError(error: unknown, fallback = 'Произошла ошибка', options?: NotifyOptions) {
    const apiError = toApiError(error)
    return sonnerToast.error(getErrorMessage(apiError, fallback), {
      description: options?.description,
      duration: options?.duration,
      id: options?.id ?? apiError.code,
    })
  },
}
