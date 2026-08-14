import { useEffect, useState } from 'react'

import {
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@shared/ui'

import {
  useAssignMemberToCompanyMutation,
  useMemberAssignCandidates,
} from '../model/use-representatives'
import type { MemberAssignCandidate } from '@shared/api'

type AssignExistingMemberDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  companyName: string
}

export function AssignExistingMemberDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
}: AssignExistingMemberDialogProps) {
  const [userId, setUserId] = useState<string>()
  const [position, setPosition] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)

  const candidates = useMemberAssignCandidates(open ? companyId : undefined)
  const assignMutation = useAssignMemberToCompanyMutation(companyId)

  useEffect(() => {
    if (!open) return
    setUserId(undefined)
    setPosition('')
    setIsPrimary(false)
  }, [open, companyId])

  const selected = (candidates.data ?? []).find((item) => item.user_id === userId)

  const submit = async () => {
    if (!userId || !selected) return
    await assignMutation.mutateAsync({
      userId,
      userRole: selected.user_role,
      isPrimary,
      position: position.trim() || null,
    })
    onOpenChange(false)
  }

  const candidateSuffix = (user: MemberAssignCandidate) => {
    if (user.current_company_name) {
      return ` · сейчас: ${user.current_company_name}`
    }
    if (user.user_role === 'admin') {
      return ' · сотрудник АПСС'
    }
    return ' · без компании'
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Добавить существующего участника"
      description={`Привязать учётную запись к компании «${companyName}». Подходят и представители, и сотрудники АПСС. Если человек уже привязан к другой компании — он будет перенесён.`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!userId || assignMutation.isPending}
            onClick={() => void submit()}
          >
            {assignMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Добавить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Участник" required>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  candidates.isLoading
                    ? 'Загрузка…'
                    : (candidates.data?.length ?? 0) === 0
                      ? 'Нет доступных участников'
                      : 'Выберите участника'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((user) => (
                <SelectItem key={user.user_id} value={user.user_id}>
                  {(user.full_name || 'Без имени') + ' · ' + user.email + candidateSuffix(user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {selected?.current_company_name ? (
          <p className="text-muted-foreground text-xs">
            Сейчас в «{selected.current_company_name}» — будет переведён в эту компанию.
          </p>
        ) : null}

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
      </div>
    </Modal>
  )
}
