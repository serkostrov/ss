import { useEffect, useState } from 'react'

import { useCompanies } from '@features/companies'
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  UploadField,
} from '@shared/ui'

import {
  invoiceFormSchema,
  parseInvoiceAmount,
  toDateInputValue,
  type InvoiceFormValues,
} from '../model/schemas'
import { useCreateInvoiceMutation } from '../model/use-invoices'

type InvoiceFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCompanyId?: string
}

const emptyValues = (companyId = ''): InvoiceFormValues => ({
  companyId,
  title: '',
  number: '',
  amount: '',
  dueDate: '',
  issuedAt: toDateInputValue(),
  file: null,
})

export function InvoiceFormDialog({
  open,
  onOpenChange,
  defaultCompanyId = '',
}: InvoiceFormDialogProps) {
  const companies = useCompanies({ accessStatus: 'active' })
  const createMutation = useCreateInvoiceMutation()
  const [values, setValues] = useState<InvoiceFormValues>(() => emptyValues(defaultCompanyId))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    if (!open) return
    setValues(emptyValues(defaultCompanyId))
    setErrors({})
    setFiles([])
  }, [open, defaultCompanyId])

  const patch = <K extends keyof InvoiceFormValues>(key: K, value: InvoiceFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = invoiceFormSchema.safeParse({
      ...values,
      file: files[0] ?? null,
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const issuedAt = parsed.data.issuedAt
      ? new Date(`${parsed.data.issuedAt}T12:00:00`).toISOString()
      : new Date().toISOString()

    await createMutation.mutateAsync({
      companyId: parsed.data.companyId,
      title: parsed.data.title,
      number: parsed.data.number,
      amount: parseInvoiceAmount(parsed.data.amount),
      dueDate: parsed.data.dueDate || null,
      issuedAt,
      file: files[0] ?? null,
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Новый счёт"
      description="Счёт сразу появится у компании со статусом «К оплате»."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={createMutation.isPending} onClick={() => void submit()}>
            {createMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Выставить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Компания" required error={errors.companyId}>
          <Select
            value={values.companyId || undefined}
            onValueChange={(value) => patch('companyId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите компанию" />
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

        <FormField label="Название" required error={errors.title}>
          <Input
            value={values.title}
            onChange={(event) => patch('title', event.target.value)}
            placeholder="Членский взнос за 2026"
            autoFocus
          />
        </FormField>

        <FormField label="Номер счёта" required error={errors.number}>
          <Input
            value={values.number}
            onChange={(event) => patch('number', event.target.value)}
            placeholder="А-2026-0001"
          />
        </FormField>

        <FormField label="Сумма, ₽" required error={errors.amount}>
          <Input
            value={values.amount}
            onChange={(event) => patch('amount', event.target.value)}
            inputMode="decimal"
            placeholder="15000"
          />
        </FormField>

        <FormField label="Дата выставления" required error={errors.issuedAt}>
          <Input
            type="date"
            value={values.issuedAt}
            onChange={(event) => patch('issuedAt', event.target.value)}
          />
        </FormField>

        <FormField label="Срок оплаты" error={errors.dueDate} description="Необязательно">
          <Input
            type="date"
            value={values.dueDate ?? ''}
            onChange={(event) => patch('dueDate', event.target.value)}
          />
        </FormField>

        <UploadField
          label="Файл"
          description="PDF, Word, Excel или изображение"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip"
          value={files}
          onChange={setFiles}
          maxSizeMb={25}
          error={errors.file}
        />
      </div>
    </Modal>
  )
}
