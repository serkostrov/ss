import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Eye, FilePen, Save, Send, Trash2 } from 'lucide-react'

import { slugifyTitle } from '@shared/api'
import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DeleteDialog,
  ErrorState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  MarkdownEditor,
  PageHeader,
  Spinner,
  StatusBadge,
  Textarea,
} from '@shared/ui'

import { MaterialDocumentsPanel } from '@features/documents'
import { MaterialLevelsPicker } from '@features/material-access'

import {
  formatMaterialDate,
  materialSectionFormSchema,
  type MaterialSectionFormValues,
} from '../model/schemas'
import {
  toMaterialSectionInput,
  useDeleteMaterialSectionMutation,
  useLevelsForMaterialAcl,
  useMaterialSection,
  usePublishMaterialSectionMutation,
  useUpdateMaterialSectionMutation,
} from '../model/use-materials'

export function MaterialSectionEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useMaterialSection(id)
  const levels = useLevelsForMaterialAcl()
  const updateMutation = useUpdateMaterialSectionMutation()
  const publishMutation = usePublishMaterialSectionMutation()
  const deleteMutation = useDeleteMaterialSectionMutation()

  const [values, setValues] = useState<MaterialSectionFormValues | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [slugTouched, setSlugTouched] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  useEffect(() => {
    if (!query.data) return
    setValues({
      title: query.data.title,
      slug: query.data.slug ?? '',
      description: query.data.description ?? '',
      content: query.data.content ?? '',
      isPublished: query.data.is_published,
      levelIds: query.data.level_ids,
    })
    setSlugTouched(true)
    setErrors({})
  }, [query.data])

  if (query.isLoading || !values) {
    return <LoadingState label="Загрузка раздела…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const section = query.data
  if (!section) {
    return (
      <ErrorState
        title="Раздел не найден"
        description="Запись удалена или идентификатор неверен."
        action={
          <Button asChild variant="outline">
            <Link to={routes.admin.materials}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const patch = <K extends keyof MaterialSectionFormValues>(
    key: K,
    value: MaterialSectionFormValues[K],
  ) => {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const save = async (publishOverride?: boolean) => {
    const nextValues = {
      ...values,
      isPublished: publishOverride ?? values.isPublished,
    }
    const parsed = materialSectionFormSchema.safeParse(nextValues)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return false
    }

    await updateMutation.mutateAsync({
      id: section.id,
      values: toMaterialSectionInput(parsed.data),
    })
    setValues(parsed.data)
    return true
  }

  const pending = updateMutation.isPending || publishMutation.isPending

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit gap-1">
            <Link to={routes.admin.materials}>
              <ChevronLeft className="size-4" />
              Назад
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {section.slug && section.is_published ? (
              <IconButton
                label="В кабинете"
                onClick={() => {
                  window.open(
                    routes.cabinet.material(section.slug!),
                    '_blank',
                    'noopener,noreferrer',
                  )
                }}
              >
                <Eye />
              </IconButton>
            ) : null}
            <IconButton label="Сохранить" disabled={pending} onClick={() => void save()}>
              {updateMutation.isPending ? <Spinner size="sm" /> : <Save />}
            </IconButton>
            <IconButton
              label={section.is_published ? 'В черновик' : 'Опубликовать'}
              disabled={pending}
              onClick={() => {
                if (section.is_published) {
                  void publishMutation.mutateAsync({ id: section.id, isPublished: false })
                  return
                }
                setPublishOpen(true)
              }}
            >
              {section.is_published ? <FilePen /> : <Send />}
            </IconButton>
            <IconButton
              label="Удалить"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
            </IconButton>
          </div>
        </div>

        <PageHeader
          title={section.title}
          description="Редактор Markdown, уровни доступа и публикация."
          className="mb-0"
          status={
            section.is_published ? (
              <StatusBadge status="active" label="Опубликован" />
            ) : (
              <StatusBadge status="draft" />
            )
          }
        />
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Доступ по уровням</CardTitle>
              <CardDescription>
                Без выбранных уровней раздел невидим участникам даже после публикации.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MaterialLevelsPicker
                levels={levels.data ?? []}
                value={values.levelIds}
                onChange={(levelIds) => patch('levelIds', levelIds)}
                disabled={pending || levels.isLoading}
                error={errors.levelIds}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Служебное</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Создан: {formatMaterialDate(section.created_at)}</p>
              <p>Обновлён: {formatMaterialDate(section.updated_at)}</p>
              <p>Порядок: {section.sort_order + 1}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Содержание</CardTitle>
            <CardDescription>Markdown с превью</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Название" required error={errors.title}>
              <Input
                value={values.title}
                onChange={(event) => {
                  const title = event.target.value
                  patch('title', title)
                  if (!slugTouched) patch('slug', slugifyTitle(title))
                }}
              />
            </FormField>
            <FormField label="Slug" error={errors.slug}>
              <Input
                value={values.slug ?? ''}
                onChange={(event) => {
                  setSlugTouched(true)
                  patch('slug', event.target.value.toLowerCase())
                }}
              />
            </FormField>
            <FormField label="Краткое описание" error={errors.description}>
              <Textarea
                value={values.description ?? ''}
                onChange={(event) => patch('description', event.target.value)}
                rows={3}
              />
            </FormField>
            <FormField label="Текст раздела" error={errors.content}>
              <MarkdownEditor
                value={values.content ?? ''}
                onChange={(content) => patch('content', content)}
              />
            </FormField>
          </CardContent>
        </Card>

        <MaterialDocumentsPanel sectionId={section.id} mode="admin" />
      </div>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Опубликовать раздел?"
        description="Раздел станет доступен участникам выбранных уровней участия."
        confirmLabel="Опубликовать"
        loading={pending}
        onConfirm={async () => {
          const ok = await save(true)
          if (ok) setPublishOpen(false)
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityName={section.title}
        title="Удалить раздел?"
        description="Раздел и связанные файлы уровней доступа будут удалены."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(section.id)
          navigate(routes.admin.materials, { replace: true })
        }}
      />
    </div>
  )
}
