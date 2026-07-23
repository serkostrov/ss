import * as React from 'react'

import { cn } from '@shared/lib/utils'
import { Label } from './label'

type FormFieldProps = {
  label: string
  htmlFor?: string
  description?: string
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Labeled field shell for uncontrolled / controlled inputs outside RHF.
 * For react-hook-form use `FormField` from `./form` (exported as `RhfFormField` from the barrel).
 */
function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {description && !error ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  )
}

export { FormField }
export type { FormFieldProps }
