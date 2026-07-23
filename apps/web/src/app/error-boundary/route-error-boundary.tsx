import { isRouteErrorResponse, Link, useNavigate, useRouteError } from 'react-router-dom'

import { getErrorMessage } from '@shared/lib/errors'
import { routes } from '@shared/config'
import { Button, ErrorFallback } from '@shared/ui'

export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <ErrorFallback
          title="404 — Страница не найдена"
          description="Запрошенный адрес не существует."
          onReset={() => navigate(routes.home)}
          resetLabel="На главную"
        />
      )
    }

    if (error.status === 401) {
      return (
        <ErrorFallback
          title="401 — Требуется вход"
          description="Сессия отсутствует или истекла."
          onReset={() => navigate(routes.login)}
          resetLabel="Войти"
        />
      )
    }

    if (error.status === 403) {
      return (
        <ErrorFallback
          title="403 — Доступ запрещён"
          description="Недостаточно прав для просмотра этой страницы."
          onReset={() => navigate(routes.home)}
          resetLabel="На главную"
        />
      )
    }

    return (
      <ErrorFallback
        title={`${error.status} — ${error.statusText || 'Ошибка'}`}
        description={
          typeof error.data === 'string'
            ? error.data
            : 'Не удалось открыть страницу. Проверьте адрес или вернитесь назад.'
        }
        onReset={() => navigate(-1)}
        resetLabel="Назад"
      />
    )
  }

  const message = getErrorMessage(error)

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4">
      <ErrorFallback
        title="Ошибка маршрута"
        description={message}
        error={error instanceof Error ? error : undefined}
        onReset={() => window.location.reload()}
        resetLabel="Обновить страницу"
      />
      <Button asChild variant="link">
        <Link to={routes.home}>На главную</Link>
      </Button>
    </div>
  )
}
