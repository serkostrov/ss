import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Shield } from 'lucide-react'

import { useAuth } from '@app/providers'
import type { StaffUser } from '@shared/api'
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatusBadge,
} from '@shared/ui'

import {
  usePromoteStaffMutation,
  useSetStaffStatusMutation,
  useStaffPromoteCandidates,
  useStaffUsers,
  useUpdateStaffMutation,
} from '../model/use-staff'

function StaffEditDialog({
  open,
  onOpenChange,
  staff,
  actorIsCeo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: StaffUser | null
  actorIsCeo: boolean
}) {
  const updateMutation = useUpdateStaffMutation()
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [isCeo, setIsCeo] = useState(false)
  const [canManageGroups, setCanManageGroups] = useState(true)

  useEffect(() => {
    if (!open || !staff) return
    setFullName(staff.full_name ?? '')
    setPosition(staff.staff_position ?? '')
    setIsCeo(staff.is_ceo)
    setCanManageGroups(staff.can_manage_work_groups)
  }, [open, staff])

  if (!staff) return null

  const submit = async () => {
    await updateMutation.mutateAsync({
      userId: staff.id,
      fullName,
      staffPosition: position,
      isCeo: actorIsCeo ? isCeo : undefined,
      canManageWorkGroups: canManageGroups,
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Сотрудник АПСС"
      description={staff.email}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={updateMutation.isPending} onClick={() => void submit()}>
            {updateMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="ФИО">
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </FormField>
        <FormField label="Должность">
          <Input
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            placeholder="Например, менеджер проектов"
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={canManageGroups}
            onCheckedChange={(checked) => setCanManageGroups(checked === true)}
          />
          Курирует рабочие группы
        </label>
        {actorIsCeo ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isCeo} onCheckedChange={(checked) => setIsCeo(checked === true)} />
            Генеральный директор
          </label>
        ) : null}
      </div>
    </Modal>
  )
}

function PromoteStaffDialog({
  open,
  onOpenChange,
  actorIsCeo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  actorIsCeo: boolean
}) {
  const [search, setSearch] = useState('')
  const candidates = useStaffPromoteCandidates(search)
  const promoteMutation = usePromoteStaffMutation()
  const [userId, setUserId] = useState<string>()
  const [position, setPosition] = useState('')
  const [isCeo, setIsCeo] = useState(false)
  const [canManageGroups, setCanManageGroups] = useState(true)

  useEffect(() => {
    if (!open) return
    setUserId(undefined)
    setPosition('')
    setIsCeo(false)
    setCanManageGroups(true)
    setSearch('')
  }, [open])

  const submit = async () => {
    if (!userId) return
    await promoteMutation.mutateAsync({
      userId,
      staffPosition: position,
      isCeo: actorIsCeo ? isCeo : false,
      canManageWorkGroups: canManageGroups,
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Назначить сотрудника"
      description="Выберите существующую учётную запись участника и повысьте её до сотрудника АПСС."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!userId || promoteMutation.isPending}
            onClick={() => void submit()}
          >
            {promoteMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Назначить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Поиск пользователя">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ФИО или email"
          />
        </FormField>
        <FormField label="Пользователь" required>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите из списка" />
            </SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {(user.full_name || 'Без имени') + ' · ' + user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Должность">
          <Input value={position} onChange={(event) => setPosition(event.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={canManageGroups}
            onCheckedChange={(checked) => setCanManageGroups(checked === true)}
          />
          Курирует рабочие группы
        </label>
        {actorIsCeo ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isCeo} onCheckedChange={(checked) => setIsCeo(checked === true)} />
            Генеральный директор
          </label>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Если учётки ещё нет — сначала зарегистрируйте человека как участника, затем назначьте
          сотрудником здесь.
        </p>
      </div>
    </Modal>
  )
}

export function StaffPanel() {
  const { profile } = useAuth()
  const actorIsCeo = profile?.isCeo === true
  const staffQuery = useStaffUsers()
  const statusMutation = useSetStaffStatusMutation()
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null)
  const [promoteOpen, setPromoteOpen] = useState(false)

  const sorted = useMemo(() => staffQuery.data ?? [], [staffQuery.data])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Сотрудники АПСС"
        description="Учётные записи с правами администратора, должностями и доступом к рабочим группам."
        actions={
          <Button type="button" onClick={() => setPromoteOpen(true)}>
            Назначить сотрудника
          </Button>
        }
      />

      {staffQuery.isError ? (
        <ErrorState
          title="Не удалось загрузить сотрудников"
          error={staffQuery.error}
          onRetry={() => void staffQuery.refetch()}
        />
      ) : null}

      {!staffQuery.isLoading && !staffQuery.isError && sorted.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Нет сотрудников"
          description="Назначьте первого сотрудника из зарегистрированных пользователей."
          actionLabel="Назначить"
          onAction={() => setPromoteOpen(true)}
        />
      ) : null}

      {sorted.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Сотрудник</th>
                <th className="px-3 py-2 font-medium">Должность</th>
                <th className="px-3 py-2 font-medium">Права</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((staff) => (
                <tr key={staff.id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <p className="font-medium">{staff.full_name || 'Без имени'}</p>
                    <p className="text-xs text-muted-foreground">{staff.email}</p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {staff.staff_position || '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {staff.is_ceo ? (
                        <Badge variant="default" className="gap-1">
                          <Shield className="size-3" />
                          Гендиректор
                        </Badge>
                      ) : null}
                      {staff.can_manage_work_groups ? (
                        <Badge variant="outline">Группы</Badge>
                      ) : (
                        <Badge variant="secondary">Без групп</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge
                      status={staff.status === 'blocked' ? 'blocked' : 'confirmed'}
                      label={staff.status === 'blocked' ? 'Заблокирован' : 'Активен'}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditTarget(staff)}
                      >
                        Изменить
                      </Button>
                      {actorIsCeo && staff.id !== profile?.id && !staff.is_ceo ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={staff.status === 'blocked' ? 'default' : 'destructive'}
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            void statusMutation.mutateAsync({
                              userId: staff.id,
                              status: staff.status === 'blocked' ? 'confirmed' : 'blocked',
                            })
                          }
                        >
                          {staff.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!actorIsCeo ? (
        <p className="text-sm text-muted-foreground">
          Блокировать сотрудников может только генеральный директор.
        </p>
      ) : null}

      <StaffEditDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        staff={editTarget}
        actorIsCeo={actorIsCeo}
      />
      <PromoteStaffDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        actorIsCeo={actorIsCeo}
      />
    </div>
  )
}
