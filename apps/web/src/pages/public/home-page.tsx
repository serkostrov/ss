import { Link } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { getPostLoginPath } from '@features/auth'
import { APP_NAME, routes } from '@shared/config'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function HomePage() {
  const { isAuthenticated, profile } = useAuth()

  const primaryHref = isAuthenticated && profile ? getPostLoginPath(profile) : routes.login

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <p className="text-sm font-semibold">{APP_NAME}</p>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild>
                <Link to={primaryHref}>В кабинет</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link to={routes.login}>Войти</Link>
                </Button>
                <Button asChild>
                  <Link to={routes.register}>Регистрация</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="px-0">
            <CardTitle className="text-3xl tracking-tight sm:text-4xl">{APP_NAME}</CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Информационная система Ассоциации: материалы по уровню участия, голосования и рабочие
              группы.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 px-0">
            <Button asChild size="lg">
              <Link to={primaryHref}>{isAuthenticated ? 'Перейти в систему' : 'Войти'}</Link>
            </Button>
            {!isAuthenticated ? (
              <Button asChild size="lg" variant="outline">
                <Link to={routes.register}>Стать участником</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
