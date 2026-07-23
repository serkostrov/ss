import { UpdatePasswordForm } from '@features/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

export function UpdatePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый пароль</CardTitle>
        <CardDescription>Задайте новый пароль для вашей учётной записи</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  )
}
