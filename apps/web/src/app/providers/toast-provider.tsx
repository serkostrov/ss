import type { ReactNode } from 'react'

import { Toaster } from '@shared/ui'

type ToastProviderProps = {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
