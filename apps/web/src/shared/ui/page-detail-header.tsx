import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

import { Button } from './button'
import { PageActions } from './page-actions'
import { PageHeader } from './page-header'

type PageDetailHeaderProps = {
  backTo: string
  title: string
  description?: string
  status?: ReactNode
  children: ReactNode
}

/**
 * Detail page chrome:
 * - top row: back link (left) + action buttons in a row (right)
 * - title block below
 */
function PageDetailHeader({
  backTo,
  title,
  description,
  status,
  children,
}: PageDetailHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm" className="-ms-2 shrink-0 gap-1">
          <Link to={backTo}>
            <ChevronLeft className="size-4" />
            Назад
          </Link>
        </Button>
        <PageActions>{children}</PageActions>
      </div>

      <PageHeader title={title} description={description} className="mb-0" status={status} />
    </div>
  )
}

export { PageDetailHeader }
export type { PageDetailHeaderProps }
