import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Star, UserRoundPlus } from 'lucide-react'

import {
  AssignExistingMemberDialog,
  RepresentativeFormDialog,
  useRepresentativesByCompany,
} from '@features/representatives'
import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from '@shared/ui'

type CompanyRepresentativesPanelProps = {
  companyId: string
  companyName: string
}

export function CompanyRepresentativesPanel({
  companyId,
  companyName,
}: CompanyRepresentativesPanelProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const query = useRepresentativesByCompany(companyId)
  const representatives = query.data ?? []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Представители</CardTitle>
            <CardDescription>
              Все контакты компании «{companyName}»
              {query.isSuccess ? ` · ${representatives.length}` : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <UserRoundPlus className="size-4" />
              Существующий
            </Button>
            <Button type="button" size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              Новый
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Загрузка представителей">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-3/4" />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : representatives.length === 0 ? (
            <EmptyState
              title="Представителей нет"
              description="Создайте контакт или привяжите уже зарегистрированного участника."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setAssignOpen(true)}>
                    <UserRoundPlus className="size-4" />
                    Существующий
                  </Button>
                  <Button type="button" onClick={() => setFormOpen(true)}>
                    <Plus className="size-4" />
                    Новый
                  </Button>
                </div>
              }
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {representatives.map((rep) => (
                <li key={rep.id}>
                  <Link
                    to={routes.admin.representative(rep.id)}
                    className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex items-center justify-between gap-3 w-full">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {rep.is_primary ? (
                          <Star
                            className="size-3.5 shrink-0 text-amber-500"
                            aria-label="Основной"
                          />
                        ) : null}
                        {rep.full_name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {rep.position || 'Должность не указана'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[rep.email, rep.phone].filter(Boolean).join(' · ') || 'Контакты не указаны'}
                      </p>
                      <StatusBadge
                        status={rep.is_active ? 'active' : 'archived'}
                        label={rep.is_active ? 'Активен' : 'Неактивен'}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RepresentativeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultCompanyId={companyId}
      />

      <AssignExistingMemberDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        companyId={companyId}
        companyName={companyName}
      />
    </>
  )
}
