import { Link } from 'react-router-dom'

import { LoginForm } from '@features/auth'
import { routes } from '@shared/config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Личный кабинет участника и панель админа</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm />
        <p className="text-sm text-muted-foreground">
          Нет аккаунта?{' '}
          <Link className="text-primary underline-offset-4 hover:underline" to={routes.register}>
            Регистрация
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
