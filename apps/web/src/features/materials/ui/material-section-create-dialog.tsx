import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { slugifyTitle } from '@shared/api'
import { routes } from '@shared/config'
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Spinner,
  Textarea,
} from '@shared/ui'
import { MaterialLevelsPicker } from '@features/material-access'

import {
  materialSectionFormSchema,
  type MaterialSectionFormValues,
} from '../model/schemas'
import {
  toMaterialSectionInput,
  useCreateMaterialSectionMutation,
  useLevelsForMaterialAcl,
} from '../model/use-materials'

type MaterialSectionCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const emptyValues: MaterialSectionFormValues = {
  title: '',
  slug: '',
  description: '',
  content: '',
  isPublished: false,
  levelIds: [],
}

export function MaterialSectionCreateDialog({
  open,
  onOpenChange,
}: MaterialSectionCreateDialogProps) {
  const navigate = useNavigate()
  const levels = useLevelsForMaterialAcl()
  const createMutation = useCreateMaterialSectionMutation()
  const [values, setValues] = useState<MaterialSectionFormValues>(emptyValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [slugTouched, setSlugTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(emptyValues)
    setErrors({})
    setSlugTouched(false)
  }, [open])

  const patch = <K extends keyof MaterialSectionFormValues>(
    key: K,
    value: MaterialSectionFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = materialSectionFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const created = await createMutation.mutateAsync(toMaterialSectionInput(parsed.data))
    onOpenChange(false)
    navigate(routes.admin.material(created.id))
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Новый раздел материалов"
      description="Черновик можно дополнить в карточке: Markdown, уровни доступа и публикация."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={createMutation.isPending}
            onClick={() => void submit()}
          >
            {createMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Создать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Название" required error={errors.title}>
          <Input
            value={values.title}
            onChange={(event) => {
              const title = event.target.value
              patch('title', title)
              if (!slugTouched) patch('slug', slugifyTitle(title))
            }}
            autoFocus
          />
        </FormField>
        <FormField label="Slug" error={errors.slug} description="URL кабинета: /cabinet/materials/{slug}">
          <Input
            value={values.slug ?? ''}
            onChange={(event) => {
              setSlugTouched(true)
              patch('slug', event.target.value.toLowerCase())
            }}
            placeholder="avtomatizatsiya"
          />
        </FormField>
        <FormField label="Краткое описание" error={errors.description}>
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => patch('description', event.target.value)}
            rows={3}
          />
        </FormField>
        <div className="space-y-2">
          <p className="text-sm font-medium">Уровни доступа</p>
          <MaterialLevelsPicker
            levels={levels.data ?? []}
            value={values.levelIds}
            onChange={(levelIds) => patch('levelIds', levelIds)}
            disabled={createMutation.isPending || levels.isLoading}
            error={errors.levelIds}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.isPublished}
            onCheckedChange={(checked) => patch('isPublished', checked === true)}
          />
          Опубликовать сразу
        </label>
      </div>
    </Modal>
  )
}
