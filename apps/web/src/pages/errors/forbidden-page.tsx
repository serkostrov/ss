import { Link } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

import { useAuth } from '@app/providers'
import { getPostLoginPath } from '@features/auth'
import { routes } from '@shared/config'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function ForbiddenPage() {
  const { profile, isAuthenticated } = useAuth()
  const home = isAuthenticated && profile ? getPostLoginPath(profile) : routes.home

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldOff className="size-5" aria-hidden />
          </div>
          <CardTitle>403 — Доступ запрещён</CardTitle>
          <CardDescription>
            У вашей роли недостаточно прав для просмотра этой страницы.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={home}>В доступный раздел</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={routes.home}>На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
