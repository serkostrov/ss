import { Link, useNavigate } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'

import { routes } from '@shared/config'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="size-5" aria-hidden />
          </div>
          <CardTitle>404 — Страница не найдена</CardTitle>
          <CardDescription>Такого адреса нет. Проверьте ссылку или вернитесь назад.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => navigate(-1)}>
            Назад
          </Button>
          <Button asChild variant="outline">
            <Link to={routes.home}>На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
