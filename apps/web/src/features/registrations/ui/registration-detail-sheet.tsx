import { useState } from 'react'
import { Ban, CheckCircle2, ShieldOff, UserCheck } from 'lucide-react'

import type { RegistrationApplication } from '@shared/api'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from '@shared/ui'

import { formatRegistrationDate } from '../model/schemas'
import {
  useRegistrationApplication,
  useRejectRegistrationMutation,
  useSetUserStatusMutation,
} from '../model/use-registrations'
import { ConfirmRegistrationDialog } from './confirm-registration-dialog'

type RegistrationDetailSheetProps = {
  userId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegistrationDetailSheet({
  userId,
  open,
  onOpenChange,
}: RegistrationDetailSheetProps) {
  const detail = useRegistrationApplication(open ? userId : null)
  const rejectMutation = useRejectRegistrationMutation()
  const statusMutation = useSetUserStatusMutation()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [unblockOpen, setUnblockOpen] = useState(false)

  const application = detail.data

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Карточка заявки</SheetTitle>
            <SheetDescription>
              Просмотр данных заявителя и действия админа.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {detail.isLoading ? <LoadingState label="Загрузка заявки…" /> : null}
            {detail.isError ? (
              <ErrorState
                compact
                error={detail.error}
                onRetry={() => void detail.refetch()}
              />
            ) : null}
            {application ? <ApplicationCard application={application} /> : null}
          </div>

          {application ? (
            <SheetFooter className="gap-2 sm:flex-col">
              {application.status === 'pending' ? (
                <>
                  <Button type="button" onClick={() => setConfirmOpen(true)}>
                    <UserCheck className="size-4" />
                    Подтвердить
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => setRejectOpen(true)}>
                    <ShieldOff className="size-4" />
                    Отклонить
                  </Button>
                </>
              ) : null}

              {application.status === 'confirmed' ? (
                <Button type="button" variant="destructive" onClick={() => setBlockOpen(true)}>
                  <Ban className="size-4" />
                  Заблокировать
                </Button>
              ) : null}

              {application.status === 'blocked' && application.representative_id ? (
                <Button type="button" onClick={() => setUnblockOpen(true)}>
                  <CheckCircle2 className="size-4" />
                  Разблокировать
                </Button>
              ) : null}

              {application.status === 'blocked' && !application.representative_id ? (
                <Button type="button" onClick={() => setConfirmOpen(true)}>
                  <UserCheck className="size-4" />
                  Подтвердить и привязать
                </Button>
              ) : null}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      {application ? (
        <ConfirmRegistrationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          application={application}
          onSuccess={() => onOpenChange(false)}
        />
      ) : null}

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Отклонить заявку?"
        description="Статус будет изменён на «Заблокирован». Операция выполняется через RPC reject_registration."
        confirmLabel="Отклонить"
        destructive
        loading={rejectMutation.isPending}
        onConfirm={async () => {
          if (!userId) return
          await rejectMutation.mutateAsync(userId)
          setRejectOpen(false)
          onOpenChange(false)
        }}
      />

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title="Заблокировать пользователя?"
        description="Участник потеряет доступ в кабинет. Статус → blocked (RPC set_user_status)."
        confirmLabel="Заблокировать"
        destructive
        loading={statusMutation.isPending}
        onConfirm={async () => {
          if (!userId) return
          await statusMutation.mutateAsync({ userId, status: 'blocked' })
          setBlockOpen(false)
          onOpenChange(false)
        }}
      />

      <ConfirmDialog
        open={unblockOpen}
        onOpenChange={setUnblockOpen}
        title="Разблокировать пользователя?"
        description="Статус вернётся к confirmed при наличии привязанного представителя."
        confirmLabel="Разблокировать"
        loading={statusMutation.isPending}
        onConfirm={async () => {
          if (!userId) return
          await statusMutation.mutateAsync({ userId, status: 'confirmed' })
          setUnblockOpen(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}

function ApplicationCard({ application }: { application: RegistrationApplication }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{application.full_name || 'Без имени'}</p>
          <p className="truncate text-muted-foreground">{application.email}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <Separator />

      <dl className="grid gap-3">
        <Field label="Телефон" value={application.phone} />
        <Field label="ИНН (из заявки)" value={application.company_inn_hint} />
        <Field label="Компания (из заявки)" value={application.company_name_hint} />
        <Field label="Создана" value={formatRegistrationDate(application.created_at)} />
      </dl>

      {application.representative ? (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Представитель
            </p>
            <p className="font-medium">{application.representative.full_name}</p>
            <p className="text-muted-foreground">
              {application.representative.company?.name ?? 'Компания не указана'}
            </p>
            {application.representative.position ? (
              <p className="text-muted-foreground">{application.representative.position}</p>
            ) : null}
            <Field label="Email" value={application.representative.email} />
            <Field label="Телефон" value={application.representative.phone} />
          </div>
        </>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value?.trim() || '—'}</dd>
    </div>
  )
}
