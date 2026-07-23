import { Link } from 'react-router-dom'

import { RegisterForm } from '@features/auth'
import { routes } from '@shared/config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>
          После регистрации заявка попадёт на рассмотрение админа
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <p className="text-sm text-muted-foreground">
          Уже есть аккаунт?{' '}
          <Link className="text-primary underline-offset-4 hover:underline" to={routes.login}>
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
