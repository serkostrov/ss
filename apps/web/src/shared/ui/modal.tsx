import type { ReactNode } from 'react'

import { cn } from '@shared/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

type ModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: string
  trigger?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * High-level Dialog wrapper for forms and details.
 */
function Modal({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={cn('max-w-xl', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* px keeps input borders / focus rings from clipping on overflow */}
        <div className="max-h-[70vh] space-y-0 overflow-y-auto overflow-x-hidden px-1 py-1">
          {children}
        </div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

export { Modal }
export type { ModalProps }
