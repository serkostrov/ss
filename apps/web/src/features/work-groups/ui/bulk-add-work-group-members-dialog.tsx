import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  SearchInput,
  Spinner,
} from '@shared/ui'

import {
  useBulkAddWorkGroupMembersMutation,
  useWorkGroupMemberCandidates,
} from '../model/use-work-group-members'

type BulkAddWorkGroupMembersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workGroupId: string
}

export function BulkAddWorkGroupMembersDialog({
  open,
  onOpenChange,
  workGroupId,
}: BulkAddWorkGroupMembersDialogProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const candidates = useWorkGroupMemberCandidates(open ? workGroupId : undefined, search)
  const bulkMutation = useBulkAddWorkGroupMembersMutation(workGroupId)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelected([])
  }, [open])

  const items = candidates.data ?? []
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleAllVisible = () => {
    const visibleIds = items.map((item) => item.id)
    const allSelected = visibleIds.every((id) => selectedSet.has(id))
    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !visibleIds.includes(id)))
      return
    }
    setSelected((prev) => [...new Set([...prev, ...visibleIds])])
  }

  const submit = async () => {
    if (!selected.length) return
    await bulkMutation.mutateAsync(selected)
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Массовое добавление участников"
      description="Дубликаты пропускаются одним запросом на сервере."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!selected.length || bulkMutation.isPending}
            onClick={() => void submit()}
          >
            {bulkMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Добавить ({selected.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Поиск кандидатов…"
          aria-label="Поиск представителей"
        />

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={toggleAllVisible}
            disabled={!items.length}
          >
            {items.length && items.every((item) => selectedSet.has(item.id))
              ? 'Снять видимых'
              : 'Выбрать видимых'}
          </button>
          <span>Выбрано: {selected.length}</span>
        </div>

        {candidates.isLoading ? <LoadingState label="Загрузка кандидатов…" /> : null}
        {candidates.isError ? (
          <ErrorState
            error={candidates.error}
            onRetry={() => void candidates.refetch()}
            compact
          />
        ) : null}

        {!candidates.isLoading && !candidates.isError && items.length === 0 ? (
          <EmptyState
            title="Нет кандидатов"
            description={
              search.trim()
                ? 'Попробуйте другой запрос или все подходящие уже в группе.'
                : 'Все активные представители уже добавлены.'
            }
            className="py-8"
          />
        ) : null}

        {items.length > 0 ? (
          <ul className="max-h-[40vh] space-y-1 overflow-y-auto pr-1">
            {items.map((rep) => (
              <li key={rep.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent/40">
                  <Checkbox
                    checked={selectedSet.has(rep.id)}
                    onCheckedChange={() => toggle(rep.id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{rep.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[rep.company?.name, rep.position, rep.email].filter(Boolean).join(' · ') ||
                        '—'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  )
}
