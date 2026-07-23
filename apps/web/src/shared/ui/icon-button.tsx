import type { ReactNode } from 'react'

import { cn } from '@shared/lib/utils'
import { Button, type ButtonProps } from './button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

type IconButtonProps = Omit<ButtonProps, 'children' | 'size'> & {
  label: string
  children: ReactNode
}

/**
 * Square outline/ghost action button: icon only, label on hover (tooltip) and aria-label.
 */
function IconButton({
  label,
  children,
  className,
  variant = 'outline',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type={type}
            variant={variant}
            size="icon"
            aria-label={label}
            className={cn(className)}
            {...props}
          >
            {children}
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { IconButton }
export type { IconButtonProps }
