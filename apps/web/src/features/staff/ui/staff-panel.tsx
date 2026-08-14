import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Shield } from 'lucide-react'

import { useAuth } from '@app/providers'
import { useCompanies } from '@features/companies'
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
  useBindStaffCompanyMutation,
  useDemoteStaffMutation,
  usePromoteStaffMutation,
  useSetStaffStatusMutation,
  useStaffPromoteCandidates,
  useStaffUsers,
  useUnbindStaffCompanyMutation,
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
  const companies = useCompanies({ accessStatus: 'all', sortBy: 'name' })
  const updateMutation = useUpdateStaffMutation()
  const bindMutation = useBindStaffCompanyMutation()
  const unbindMutation = useUnbindStaffCompanyMutation()
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [isCeo, setIsCeo] = useState(false)
  const [canManageGroups, setCanManageGroups] = useState(true)
  const [companyId, setCompanyId] = useState<string>()
  const [companyPosition, setCompanyPosition] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)

  useEffect(() => {
    if (!open || !staff) return
    setFullName(staff.full_name ?? '')
    setPosition(staff.staff_position ?? '')
    setIsCeo(staff.is_ceo)
    setCanManageGroups(staff.can_manage_work_groups)
    setCompanyId(staff.company_id ?? undefined)
    setCompanyPosition(staff.company_position ?? '')
    setIsPrimary(staff.is_primary)
  }, [open, staff])

  if (!staff) return null

  const busy =
    updateMutation.isPending || bindMutation.isPending || unbindMutation.isPending

  const submit = async () => {
    await updateMutation.mutateAsync({
      userId: staff.id,
      fullName,
      staffPosition: position,
      isCeo: actorIsCeo ? isCeo : undefined,
      canManageWorkGroups: canManageGroups,
    })

    if (companyId) {
      const positionChanged =
        (companyPosition.trim() || null) !== (staff.company_position?.trim() || null)
      const primaryChanged = isPrimary !== staff.is_primary
      const companyChanged = companyId !== staff.company_id

      if (companyChanged || positionChanged || primaryChanged) {
        await bindMutation.mutateAsync({
          userId: staff.id,
          companyId,
          position: companyPosition.trim() || null,
          isPrimary,
        })
      }
    }

    onOpenChange(false)
  }

  const unbind = async () => {
    await unbindMutation.mutateAsync(staff.id)
    setCompanyId(undefined)
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
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Spinner size="sm" className="text-current" /> : null}
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="ФИО">
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </FormField>
        <FormField label="Должность в АПСС">
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

        <div className="border-border space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Компания (кабинет и голосование)</p>
          <p className="text-muted-foreground text-xs">
            Привязка позволяет сотруднику переключаться в личный кабинет и голосовать от имени
            компании, не снимая статус сотрудника АПСС.
          </p>
          <FormField label="Компания">
            <Select
              value={companyId}
              onValueChange={(value) => setCompanyId(value)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    companies.isLoading
                      ? 'Загрузка…'
                      : (companies.data?.length ?? 0) === 0
                        ? 'Нет компаний'
                        : 'Без компании'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(companies.data ?? []).map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {companyId ? (
            <>
              <FormField label="Должность в компании">
                <Input
                  value={companyPosition}
                  onChange={(event) => setCompanyPosition(event.target.value)}
                  placeholder="Необязательно"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isPrimary}
                  onCheckedChange={(checked) => setIsPrimary(checked === true)}
                />
                Сделать основным представителем
              </label>
            </>
          ) : null}
          {staff.company_id ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void unbind()}
            >
              Отвязать компанию
            </Button>
          ) : null}
        </div>
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
  const companies = useCompanies({ accessStatus: 'all', sortBy: 'name' })
  const candidates = useStaffPromoteCandidates('')
  const promoteMutation = usePromoteStaffMutation()
  const [userId, setUserId] = useState<string>()
  const [position, setPosition] = useState('')
  const [isCeo, setIsCeo] = useState(false)
  const [canManageGroups, setCanManageGroups] = useState(true)
  const [companyId, setCompanyId] = useState<string>()
  const [companyPosition, setCompanyPosition] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)

  useEffect(() => {
    if (!open) return
    setUserId(undefined)
    setPosition('')
    setIsCeo(false)
    setCanManageGroups(true)
    setCompanyId(undefined)
    setCompanyPosition('')
    setIsPrimary(false)
  }, [open])

  const submit = async () => {
    if (!userId) return
    await promoteMutation.mutateAsync({
      userId,
      staffPosition: position,
      isCeo: actorIsCeo ? isCeo : false,
      canManageWorkGroups: canManageGroups,
      companyId: companyId ?? null,
      companyPosition: companyPosition.trim() || null,
      isPrimary,
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Назначить сотрудника"
      description="Выберите учётную запись участника. Компанию можно указать сразу — тогда сотрудник сможет открывать кабинет и голосовать от её имени."
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
        <FormField label="Должность в АПСС">
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

        <div className="border-border space-y-3 border-t pt-3">
          <FormField label="Компания">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    companies.isLoading
                      ? 'Загрузка…'
                      : (companies.data?.length ?? 0) === 0
                        ? 'Нет компаний'
                        : 'Необязательно'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(companies.data ?? []).map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {companyId ? (
            <>
              <FormField label="Должность в компании">
                <Input
                  value={companyPosition}
                  onChange={(event) => setCompanyPosition(event.target.value)}
                  placeholder="Необязательно"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isPrimary}
                  onCheckedChange={(checked) => setIsPrimary(checked === true)}
                />
                Сделать основным представителем
              </label>
            </>
          ) : null}
        </div>

        <p className="text-muted-foreground text-xs">
          Если учётки ещё нет — сначала зарегистрируйте человека как участника, затем назначьте
          сотрудником здесь.
        </p>
      </div>
    </Modal>
  )
}

function DemoteStaffDialog({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: StaffUser | null
}) {
  const companies = useCompanies({ accessStatus: 'all', sortBy: 'name' })
  const demoteMutation = useDemoteStaffMutation()
  const [companyId, setCompanyId] = useState<string>()
  const [position, setPosition] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)

  const boundCompanyId = staff?.company_id ?? null
  const boundCompanyName = staff?.company_name ?? null
  const hasBoundCompany = Boolean(boundCompanyId)

  useEffect(() => {
    if (!open || !staff) return
    setCompanyId(staff.company_id ?? undefined)
    setPosition(staff.company_position ?? '')
    setIsPrimary(staff.is_primary)
  }, [open, staff])

  if (!staff) return null

  const resolvedCompanyId = boundCompanyId ?? companyId

  const submit = async () => {
    await demoteMutation.mutateAsync({
      userId: staff.id,
      companyId: hasBoundCompany ? resolvedCompanyId : resolvedCompanyId ?? null,
      position: hasBoundCompany
        ? (staff.company_position ?? null)
        : position.trim() || null,
      isPrimary: hasBoundCompany ? staff.is_primary : isPrimary,
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Снять статус сотрудника"
      description={
        hasBoundCompany
          ? `${staff.full_name || staff.email}: права администратора будут сняты, учётная запись останется активной как представитель компании «${boundCompanyName}» (без блокировки).`
          : `${staff.full_name || staff.email}: права администратора будут сняты. Можно привязать к компании или оставить учётную запись без компании.`
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={demoteMutation.isPending}
            onClick={() => void submit()}
          >
            {demoteMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Снять статус
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {hasBoundCompany ? (
          <FormField label="Компания">
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {boundCompanyName || 'Привязанная компания'}
              {staff.company_position ? (
                <span className="text-muted-foreground"> · {staff.company_position}</span>
              ) : null}
            </p>
          </FormField>
        ) : (
          <>
            <FormField
              label="Компания"
              description="Необязательно — можно снять статус без привязки к компании"
            >
              <Select
                value={companyId ?? '__none__'}
                onValueChange={(value) => setCompanyId(value === '__none__' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      companies.isLoading
                        ? 'Загрузка…'
                        : 'Без компании'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без компании</SelectItem>
                  {(companies.data ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {companyId ? (
              <>
                <FormField label="Должность в компании">
                  <Input
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                    placeholder="Необязательно"
                  />
                </FormField>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={isPrimary}
                    onCheckedChange={(checked) => setIsPrimary(checked === true)}
                  />
                  Сделать основным представителем
                </label>
              </>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  )
}

export function StaffPanel() {
  const { profile, refreshProfile } = useAuth()
  const actorIsCeo = profile?.isCeo === true
  const staffQuery = useStaffUsers()
  const statusMutation = useSetStaffStatusMutation()
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null)
  const [demoteTarget, setDemoteTarget] = useState<StaffUser | null>(null)
  const [promoteOpen, setPromoteOpen] = useState(false)

  const sorted = useMemo(() => staffQuery.data ?? [], [staffQuery.data])

  const handleEditOpenChange = (open: boolean) => {
    if (!open) {
      const editedSelf = editTarget?.id === profile?.id
      setEditTarget(null)
      if (editedSelf) void refreshProfile()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Сотрудники АПСС"
        description="Учётные записи администраторов. Привязка компании даёт доступ к кабинету и голосованию без снятия статуса сотрудника."
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
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Сотрудник</th>
                <th className="px-3 py-2 font-medium">Должность</th>
                <th className="px-3 py-2 font-medium">Компания</th>
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
                    <p className="text-muted-foreground text-xs">{staff.email}</p>
                  </td>
                  <td className="text-muted-foreground px-3 py-3">{staff.staff_position || '—'}</td>
                  <td className="text-muted-foreground px-3 py-3">{staff.company_name || '—'}</td>
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
                      {staff.id !== profile?.id && (!staff.is_ceo || actorIsCeo) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDemoteTarget(staff)}
                        >
                          Снять статус
                        </Button>
                      ) : null}
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
        <p className="text-muted-foreground text-sm">
          Блокировать сотрудников может только генеральный директор.
        </p>
      ) : null}

      <StaffEditDialog
        open={Boolean(editTarget)}
        onOpenChange={handleEditOpenChange}
        staff={editTarget}
        actorIsCeo={actorIsCeo}
      />
      <DemoteStaffDialog
        open={Boolean(demoteTarget)}
        onOpenChange={(open) => {
          if (!open) setDemoteTarget(null)
        }}
        staff={demoteTarget}
      />
      <PromoteStaffDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        actorIsCeo={actorIsCeo}
      />
    </div>
  )
}
