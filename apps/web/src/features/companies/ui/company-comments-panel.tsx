import { useState } from 'react'
import { Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  FormField,
  IconButton,
  LoadingState,
  Spinner,
  Textarea,
} from '@shared/ui'

import { companyCommentSchema, formatCompanyDate } from '../model/schemas'
import {
  useAddCompanyCommentMutation,
  useCompanyComments,
  useDeleteCompanyCommentMutation,
} from '../model/use-companies'

type CompanyCommentsPanelProps = {
  companyId: string
}

export function CompanyCommentsPanel({ companyId }: CompanyCommentsPanelProps) {
  const query = useCompanyComments(companyId)
  const addMutation = useAddCompanyCommentMutation(companyId)
  const deleteMutation = useDeleteCompanyCommentMutation(companyId)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const parsed = companyCommentSchema.safeParse({ body })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверьте текст')
      return
    }
    setError(null)
    await addMutation.mutateAsync(parsed.data.body)
    setBody('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Комментарии</CardTitle>
        <CardDescription>История служебных заметок по компании (только админ)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Новый комментарий" error={error ?? undefined}>
          <Textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
              if (error) setError(null)
            }}
            rows={3}
            placeholder="Напишите комментарий…"
          />
        </FormField>
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={addMutation.isPending || !body.trim()}
            onClick={() => void submit()}
          >
            {addMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Добавить
          </Button>
        </div>

        {query.isLoading ? <LoadingState label="Загрузка комментариев…" /> : null}
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : null}

        {!query.isLoading && !query.isError ? (
          (query.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
          ) : (
            <ul className="space-y-3">
              {(query.data ?? []).map((comment) => {
                const author =
                  comment.author?.full_name?.trim() ||
                  comment.author?.email ||
                  'Администратор'
                return (
                  <li
                    key={comment.id}
                    className="rounded-md border bg-muted/30 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {author} · {formatCompanyDate(comment.created_at)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
                      </div>
                      <IconButton
                        label="Удалить комментарий"
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => void deleteMutation.mutateAsync(comment.id)}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
