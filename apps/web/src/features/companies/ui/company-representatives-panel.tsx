import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2Off, Plus, Star, UserRoundPlus } from 'lucide-react'

import type { Representative } from '@shared/api'
import {
  AssignExistingMemberDialog,
  RepresentativeFormDialog,
  useRemoveRepresentativeFromCompanyMutation,
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
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
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
  const [removeTarget, setRemoveTarget] = useState<Representative | null>(null)
  const query = useRepresentativesByCompany(companyId)
  const removeMutation = useRemoveRepresentativeFromCompanyMutation()
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
                <li key={rep.id} className="flex items-stretch">
                  <Link
                    to={routes.admin.representative(rep.id)}
                    className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-3 px-3 py-3 transition-colors"
                  >
                    <p className="min-w-0 flex-1 truncate font-medium">
                      <span className="flex items-center gap-1.5">
                        {rep.is_primary ? (
                          <Star
                            className="size-3.5 shrink-0 text-amber-500"
                            aria-label="Основной"
                          />
                        ) : null}
                        {rep.full_name}
                      </span>
                    </p>
                    <p className="text-muted-foreground hidden min-w-0 flex-1 truncate text-sm sm:block">
                      {rep.position || 'Должность не указана'}
                    </p>
                    <p className="text-muted-foreground hidden min-w-0 flex-1 truncate text-xs lg:block">
                      {[
                        rep.email,
                        rep.phone,
                        rep.telegram_username ? `TG @${rep.telegram_username}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Контакты не указаны'}
                    </p>
                    <StatusBadge
                      status={rep.is_active ? 'active' : 'archived'}
                      label={rep.is_active ? 'Активен' : 'Неактивен'}
                    />
                  </Link>
                  <div className="border-l px-2 py-2">
                    <IconButton
                      label="Отвязать от компании"
                      className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={removeMutation.isPending}
                      onClick={() => setRemoveTarget(rep)}
                    >
                      <Link2Off />
                    </IconButton>
                  </div>
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

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="Отвязать от компании?"
        description={
          removeTarget?.linked_user_id
            ? `«${removeTarget.full_name}» будет убран из «${companyName}». Учётная запись сохранится без доступа к кабинету этой компании.`
            : `Контакт «${removeTarget?.full_name ?? ''}» будет убран из «${companyName}».`
        }
        confirmLabel="Отвязать"
        loading={removeMutation.isPending}
        onConfirm={async () => {
          if (!removeTarget) return
          await removeMutation.mutateAsync(removeTarget.id)
          setRemoveTarget(null)
        }}
      />
    </>
  )
}
