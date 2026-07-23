import { useMemo, useState } from 'react'
import { Plus, Trash2, UserPlus, Users } from 'lucide-react'

import type { WorkGroupMember } from '@shared/api'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/ui'

import {
  useAddWorkGroupMemberMutation,
  useRemoveManyWorkGroupMembersMutation,
  useRemoveWorkGroupMemberMutation,
  useWorkGroupMemberCandidates,
  useWorkGroupMembers,
} from '../model/use-work-group-members'
import { BulkAddWorkGroupMembersDialog } from './bulk-add-work-group-members-dialog'
import { formatWorkGroupDate } from '../model/schemas'

type WorkGroupMembersPanelProps = {
  workGroupId: string
}

export function WorkGroupMembersPanel({ workGroupId }: WorkGroupMembersPanelProps) {
  const [search, setSearch] = useState('')
  const [singleId, setSingleId] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removeOne, setRemoveOne] = useState<WorkGroupMember | null>(null)
  const [removeManyOpen, setRemoveManyOpen] = useState(false)

  const membersQuery = useWorkGroupMembers(workGroupId, search)
  const candidatesQuery = useWorkGroupMemberCandidates(workGroupId, '')
  const addMutation = useAddWorkGroupMemberMutation(workGroupId)
  const removeMutation = useRemoveWorkGroupMemberMutation(workGroupId)
  const removeManyMutation = useRemoveManyWorkGroupMembersMutation(workGroupId)

  const members = membersQuery.data ?? []
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggleRow = (memberId: string) => {
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  const toggleAll = () => {
    if (members.length && members.every((item) => selectedSet.has(item.id))) {
      setSelectedIds([])
      return
    }
    setSelectedIds(members.map((item) => item.id))
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Участники группы
            </CardTitle>
            <CardDescription>
              Добавление представителей без дублей. Массовое добавление — один RPC.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <UserPlus className="size-4" />
              Массово
            </Button>
            {selectedIds.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setRemoveManyOpen(true)}
              >
                <Trash2 className="size-4" />
                Удалить ({selectedIds.length})
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Поиск по ФИО, компании, email…"
            aria-label="Поиск участников"
            className="w-full lg:max-w-sm"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={singleId || undefined} onValueChange={setSingleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Добавить представителя" />
              </SelectTrigger>
              <SelectContent>
                {(candidatesQuery.data ?? []).map((rep) => (
                  <SelectItem key={rep.id} value={rep.id}>
                    {rep.full_name}
                    {rep.company ? ` · ${rep.company.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={!singleId || addMutation.isPending}
              onClick={async () => {
                if (!singleId) return
                await addMutation.mutateAsync(singleId)
                setSingleId('')
              }}
            >
              <Plus className="size-4" />
              Добавить
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {membersQuery.isLoading ? <LoadingState label="Загрузка участников…" /> : null}
        {membersQuery.isError ? (
          <ErrorState
            error={membersQuery.error}
            onRetry={() => void membersQuery.refetch()}
            compact
          />
        ) : null}

        {!membersQuery.isLoading && !membersQuery.isError && members.length === 0 ? (
          <EmptyState
            title={search.trim() ? 'Никого не найдено' : 'Участников пока нет'}
            description={
              search.trim()
                ? 'Измените поисковый запрос.'
                : 'Добавьте представителей по одному или массово.'
            }
            className="py-8"
          />
        ) : null}

        {members.length > 0 ? (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={
                    members.every((item) => selectedSet.has(item.id))
                      ? true
                      : members.some((item) => selectedSet.has(item.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={() => toggleAll()}
                />
                Выбрать всех на экране
              </label>
              <span>
                Показано: {members.length}
                {search.trim() ? ' (фильтр)' : ''}
              </span>
            </div>

            <ul className="space-y-2">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selectedSet.has(member.id)}
                    onCheckedChange={() => toggleRow(member.id)}
                    aria-label="Выбрать участника"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {member.representative?.full_name ?? 'Представитель'}
                      </p>
                      {member.representative && !member.representative.is_active ? (
                        <Badge variant="outline">неактивен</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        member.representative?.company?.name,
                        member.representative?.position,
                        member.representative?.email,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Добавлен: {formatWorkGroupDate(member.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-destructive"
                    disabled={removeMutation.isPending}
                    aria-label="Удалить участника"
                    onClick={() => setRemoveOne(member)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </CardContent>

      <BulkAddWorkGroupMembersDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        workGroupId={workGroupId}
      />

      <ConfirmDialog
        open={Boolean(removeOne)}
        onOpenChange={(open) => {
          if (!open) setRemoveOne(null)
        }}
        title="Убрать участника?"
        description={
          removeOne
            ? `«${removeOne.representative?.full_name ?? 'Представитель'}» будет исключён из группы.`
            : undefined
        }
        confirmLabel="Убрать"
        loading={removeMutation.isPending}
        onConfirm={async () => {
          if (!removeOne) return
          await removeMutation.mutateAsync(removeOne.id)
          setSelectedIds((prev) => prev.filter((id) => id !== removeOne.id))
          setRemoveOne(null)
        }}
      />

      <ConfirmDialog
        open={removeManyOpen}
        onOpenChange={setRemoveManyOpen}
        title="Удалить выбранных?"
        description={`Будет удалено участников: ${selectedIds.length}.`}
        confirmLabel="Удалить"
        loading={removeManyMutation.isPending}
        onConfirm={async () => {
          await removeManyMutation.mutateAsync(selectedIds)
          setSelectedIds([])
          setRemoveManyOpen(false)
        }}
      />
    </Card>
  )
}
