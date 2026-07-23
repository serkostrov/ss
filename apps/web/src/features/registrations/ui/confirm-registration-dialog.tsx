import { useEffect, useState } from 'react'
import { Link2, UserPlus } from 'lucide-react'

import type { RegistrationApplication } from '@shared/api'
import { cn } from '@shared/lib/utils'
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@shared/ui'

import {
  confirmRegistrationSchema,
  type ConfirmRegistrationFormValues,
} from '../model/schemas'
import {
  useCompanyOptions,
  useConfirmRegistrationMutation,
  useRepresentativeOptions,
} from '../model/use-registrations'

type ConfirmRegistrationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  application: RegistrationApplication
  onSuccess?: () => void
}

function buildDefaults(application: RegistrationApplication): ConfirmRegistrationFormValues {
  return {
    mode: 'create',
    representativeId: undefined,
    companyMode:
      application.company_name_hint || application.company_inn_hint ? 'new' : 'existing',
    companyId: undefined,
    companyName: application.company_name_hint ?? '',
    companyInn: application.company_inn_hint ?? '',
    fullName: application.full_name ?? '',
    position: '',
    phone: application.phone ?? '',
    email: application.email ?? '',
    isPrimary: true,
  }
}

export function ConfirmRegistrationDialog({
  open,
  onOpenChange,
  application,
  onSuccess,
}: ConfirmRegistrationDialogProps) {
  const [values, setValues] = useState<ConfirmRegistrationFormValues>(() =>
    buildDefaults(application),
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const confirmMutation = useConfirmRegistrationMutation()
  const representatives = useRepresentativeOptions()
  const companies = useCompanyOptions()

  useEffect(() => {
    if (!open) return
    setValues(buildDefaults(application))
    setFieldErrors({})
  }, [open, application])

  const availableReps = (representatives.data ?? []).filter((item) => !item.linkedUserId)

  const patch = <K extends keyof ConfirmRegistrationFormValues>(
    key: K,
    value: ConfirmRegistrationFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = confirmRegistrationSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setFieldErrors(next)
      return
    }

    await confirmMutation.mutateAsync({ application, values: parsed.data })
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Подтвердить заявку"
      description="Привяжите существующего представителя или создайте нового."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={confirmMutation.isPending} onClick={() => void submit()}>
            {confirmMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Подтвердить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
              values.mode === 'link' ? 'border-primary bg-accent' : 'hover:bg-muted/60',
            )}
            onClick={() => patch('mode', 'link')}
          >
            <Link2 className="size-4 shrink-0" />
            <span>
              <span className="block font-medium">Существующий</span>
              <span className="text-xs text-muted-foreground">Привязать представителя</span>
            </span>
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
              values.mode === 'create' ? 'border-primary bg-accent' : 'hover:bg-muted/60',
            )}
            onClick={() => patch('mode', 'create')}
          >
            <UserPlus className="size-4 shrink-0" />
            <span>
              <span className="block font-medium">Создать</span>
              <span className="text-xs text-muted-foreground">Новый представитель</span>
            </span>
          </button>
        </div>

        {values.mode === 'link' ? (
          <div className="space-y-3">
            <FormField
              label="Представитель"
              error={fieldErrors.representativeId}
              required
            >
              <Select
                value={values.representativeId}
                onValueChange={(value) => patch('representativeId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите из списка" />
                </SelectTrigger>
                <SelectContent>
                  {availableReps.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.fullName} · {item.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {!representatives.isLoading && availableReps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Свободных представителей нет — создайте нового.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Компания</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={values.companyMode === 'existing' ? 'default' : 'outline'}
                  onClick={() => patch('companyMode', 'existing')}
                >
                  Существующая
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={values.companyMode === 'new' ? 'default' : 'outline'}
                  onClick={() => patch('companyMode', 'new')}
                >
                  Новая
                </Button>
              </div>
            </div>

            {values.companyMode === 'existing' ? (
              <FormField label="Компания" error={fieldErrors.companyId} required>
                <Select
                  value={values.companyId}
                  onValueChange={(value) => patch('companyId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите компанию" />
                  </SelectTrigger>
                  <SelectContent>
                    {(companies.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : (
              <>
                <FormField label="ИНН" error={fieldErrors.companyInn}>
                  <Input
                    inputMode="numeric"
                    value={values.companyInn ?? ''}
                    onChange={(event) =>
                      patch('companyInn', event.target.value.replace(/\D/g, '').slice(0, 12))
                    }
                    placeholder="10 или 12 цифр"
                  />
                </FormField>
                <FormField label="Название компании" error={fieldErrors.companyName} required>
                  <Input
                    value={values.companyName ?? ''}
                    onChange={(event) => patch('companyName', event.target.value)}
                    placeholder="ООО «Пример»"
                  />
                </FormField>
              </>
            )}

            <FormField label="ФИО представителя" error={fieldErrors.fullName} required>
              <Input
                value={values.fullName ?? ''}
                onChange={(event) => patch('fullName', event.target.value)}
              />
            </FormField>
            <FormField label="Должность">
              <Input
                value={values.position ?? ''}
                onChange={(event) => patch('position', event.target.value)}
                placeholder="Опционально"
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Телефон">
                <Input
                  value={values.phone ?? ''}
                  onChange={(event) => patch('phone', event.target.value)}
                />
              </FormField>
              <FormField label="Email" error={fieldErrors.email}>
                <Input
                  value={values.email ?? ''}
                  onChange={(event) => patch('email', event.target.value)}
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.isPrimary}
                onCheckedChange={(checked) => patch('isPrimary', checked === true)}
              />
              Основной представитель компании
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}
