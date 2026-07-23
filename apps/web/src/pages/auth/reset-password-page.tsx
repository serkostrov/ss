import { Link } from 'react-router-dom'

import { ResetPasswordForm } from '@features/auth'
import { routes } from '@shared/config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Восстановление пароля</CardTitle>
        <CardDescription>Мы отправим ссылку для сброса на ваш email</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResetPasswordForm />
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary underline-offset-4 hover:underline" to={routes.login}>
            Вернуться ко входу
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
