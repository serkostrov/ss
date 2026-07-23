import { Link, useLocation } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'

import {
  buildLocationPath,
  saveIntendedRoute,
  type LoginLocationState,
} from '@app/lib/intended-route'
import { routes } from '@shared/config'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function UnauthorizedPage() {
  const location = useLocation()
  const state = location.state as LoginLocationState | null
  const intended = state?.from

  const loginState: LoginLocationState | undefined = intended
    ? { from: intended }
    : undefined

  if (intended) {
    saveIntendedRoute(intended)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
            <LockKeyhole className="size-5" aria-hidden />
          </div>
          <CardTitle>401 — Требуется вход</CardTitle>
          <CardDescription>
            Сессия отсутствует или истекла. Войдите, чтобы продолжить.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              to={routes.login}
              state={loginState}
              onClick={() => {
                const path = buildLocationPath(location.pathname, location.search)
                if (intended) saveIntendedRoute(intended)
                else if (!path.startsWith(routes.unauthorized)) saveIntendedRoute(path)
              }}
            >
              Войти
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={routes.home}>На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
