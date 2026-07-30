import * as React from 'react'

import { cn } from '@shared/lib/utils'
import { Button } from './button'

type PageHeaderProps = {
  title: string
  description?: string
  /** Primary actions (e.g. Add) — stay top-right next to the title */
  actions?: React.ReactNode
  /** Status badges / chips — render under the description */
  status?: React.ReactNode
  className?: string
}

function PageHeader({ title, description, actions, status, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-sm leading-snug">{description}</p>
        ) : null}
        {status ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{status}</div> : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

type PageHeaderActionProps = React.ComponentProps<typeof Button>

function PageHeaderAction(props: PageHeaderActionProps) {
  return <Button {...props} />
}

export { PageHeader, PageHeaderAction }
export type { PageHeaderProps }
