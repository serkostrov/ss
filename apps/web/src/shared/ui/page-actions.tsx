import type { ReactNode } from 'react'

import { cn } from '@shared/lib/utils'

type PageActionsProps = {
  children: ReactNode
  className?: string
}

/** Horizontal cluster of icon action buttons. */
function PageActions({ children, className }: PageActionsProps) {
  return (
    <div className={cn('flex shrink-0 flex-nowrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  )
}

export { PageActions }
export type { PageActionsProps }
