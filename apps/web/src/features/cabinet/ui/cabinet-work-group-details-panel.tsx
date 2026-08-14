import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, UsersRound } from 'lucide-react'

import { WorkGroupLinksPanel, workGroupStatusLabel } from '@features/work-groups'
import type { WorkGroupLink } from '@shared/api'
import { routes } from '@shared/config'
import { formatFileSize, isPreviewableMime } from '@shared/lib/files'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FileCard,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '@shared/ui'

import {
  useCabinetDownloadWorkGroupFileMutation,
  useCabinetPreviewWorkGroupFileMutation,
  useCabinetWorkGroup,
  useCabinetWorkGroupLinks,
  useRequestWorkGroupMembershipMutation,
} from '../model/use-cabinet-work-groups'

type CabinetWorkGroupDetailsPanelProps = {
  workGroupId: string
}

export function CabinetWorkGroupDetailsPanel({ workGroupId }: CabinetWorkGroupDetailsPanelProps) {
  const navigate = useNavigate()
  const groupQuery = useCabinetWorkGroup(workGroupId)
  const group = groupQuery.data
  const isMember = group?.is_member === true
  const isResponsible = group?.is_responsible === true
  const canViewMaterials = isMember || isResponsible
  const pendingKind = group?.pending_request_kind ?? null
  const linksQuery = useCabinetWorkGroupLinks(workGroupId, canViewMaterials)
  const downloadFile = useCabinetDownloadWorkGroupFileMutation()
  const previewFile = useCabinetPreviewWorkGroupFileMutation()
  const requestMembership = useRequestWorkGroupMembershipMutation()
  const [preview, setPreview] = useState<{ link: WorkGroupLink; url: string } | null>(null)

  if (groupQuery.isLoading) {
    return <LoadingState label="Загрузка группы…" />
  }

  if (groupQuery.isError) {
    return (
      <ErrorState
        title="Не удалось загрузить группу"
        error={groupQuery.error}
        onRetry={() => void groupQuery.refetch()}
      />
    )
  }

  if (!group) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Группа не найдена"
        description="Возможно, группа архивирована или недоступна."
        actionLabel="К списку групп"
        onAction={() => navigate(routes.cabinet.workGroups)}
      />
    )
  }

  const links = linksQuery.data ?? []
  const busy = downloadFile.isPending || previewFile.isPending
  const requestBusy = requestMembership.isPending

  const openPreview = async (link: WorkGroupLink) => {
    const url = await previewFile.mutateAsync(link)
    setPreview({ link, url })
  }

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to={routes.cabinet.workGroups}>
            <ArrowLeft className="size-4" />
            Все группы
          </Link>
        </Button>
        <PageHeader
          title={group.name}
          description={group.description || 'Рабочая группа ассоциации'}
          actions={
            <div className="flex flex-wrap gap-1">
              {isResponsible ? <Badge variant="default">Ответственный</Badge> : null}
              {pendingKind ? (
                <Badge variant="secondary">
                  {pendingKind === 'join' ? 'Заявка на вступление' : 'Заявка на выход'}
                </Badge>
              ) : group.is_member ? (
                <Badge variant="default">Участник</Badge>
              ) : !isResponsible ? (
                <Badge variant="secondary">Не участник</Badge>
              ) : null}
              <StatusBadge
                status={group.status === 'active' ? 'active' : 'pending'}
                label={
                  group.status === 'active'
                    ? 'Активна'
                    : group.status === 'paused'
                      ? 'На паузе'
                      : workGroupStatusLabel(group.status)
                }
              />
            </div>
          }
        />
        {group.category_name ? (
          <p className="text-muted-foreground mt-1 text-sm">Направление: {group.category_name}</p>
        ) : null}
      </div>

      {isResponsible && !isMember ? (
        <Alert>
          <AlertTitle>Вы ответственный за эту группу</AlertTitle>
          <AlertDescription>
            Вы можете добавлять ссылки и файлы для участников. Просмотр материалов других групп
            доступен только при участии в них.
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingKind ? (
        <Alert>
          <AlertTitle>
            {pendingKind === 'join'
              ? 'Заявка на вступление на рассмотрении'
              : 'Заявка на выход на рассмотрении'}
          </AlertTitle>
          <AlertDescription>
            Администратор АПСС рассмотрит заявку. До решения статус участия не изменится.
          </AlertDescription>
        </Alert>
      ) : group.is_member ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={requestBusy}
            onClick={() =>
              requestMembership.mutate({ workGroupId: group.id, kind: 'leave' })
            }
          >
            Подать заявку на выход
          </Button>
        </div>
      ) : !isResponsible ? (
        <div className="space-y-3">
          <Alert>
            <AlertTitle>Нет доступа к материалам группы</AlertTitle>
            <AlertDescription>
              Вы не состоите в этой рабочей группе. Файлы и ссылки доступны только участникам.
              Подайте заявку на вступление — её рассмотрит администратор АПСС.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            size="sm"
            disabled={requestBusy}
            onClick={() =>
              requestMembership.mutate({ workGroupId: group.id, kind: 'join' })
            }
          >
            Подать заявку на вступление
          </Button>
        </div>
      ) : null}

      {isResponsible ? (
        <WorkGroupLinksPanel workGroupId={workGroupId} />
      ) : canViewMaterials ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Файлы и ссылки</h2>

          {linksQuery.isLoading ? <LoadingState label="Загрузка материалов…" /> : null}

          {linksQuery.isError ? (
            <ErrorState
              title="Не удалось загрузить материалы"
              error={linksQuery.error}
              onRetry={() => void linksQuery.refetch()}
            />
          ) : null}

          {!linksQuery.isLoading && !linksQuery.isError && links.length === 0 ? (
            <EmptyState
              title="Пока нет материалов"
              description="Когда ответственный или администратор добавит файлы или ссылки, они появятся здесь."
            />
          ) : null}

          {links.length > 0 ? (
            <ul className="space-y-2">
              {links.map((link) => {
                const isFile = Boolean(link.file_url)
                const meta = (() => {
                  if (isFile) return formatFileSize(link.file_size)
                  if (!link.url) return undefined
                  try {
                    return new URL(link.url).hostname
                  } catch {
                    return link.url
                  }
                })()

                return (
                  <li key={link.id}>
                    <FileCard
                      title={link.title}
                      mimeType={isFile ? link.mime_type : 'Ссылка'}
                      meta={[meta, link.description].filter(Boolean).join(' · ') || undefined}
                      busy={busy}
                      onPreview={
                        isFile && isPreviewableMime(link.mime_type)
                          ? () => void openPreview(link)
                          : undefined
                      }
                      onDownload={
                        isFile
                          ? () => downloadFile.mutate(link)
                          : link.url
                            ? () => window.open(link.url!, '_blank', 'noopener,noreferrer')
                            : undefined
                      }
                    />
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        title={preview?.link.title ?? 'Просмотр'}
        className="max-w-4xl"
      >
        {preview ? (
          <iframe
            title={preview.link.title}
            src={preview.url}
            className="h-[70vh] w-full rounded-md border"
          />
        ) : null}
      </Modal>
    </div>
  )
}
