import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { authService } from '@shared/api'
import { routes } from '@shared/config'
import { notify } from '@shared/lib/notify'
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FullPageLoader,
} from '@shared/ui'

import { UpdatePasswordForm } from '@features/auth'

export function UpdatePasswordPage() {
  const { isReady, isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const [recoveryState, setRecoveryState] = useState<'idle' | 'restoring' | 'failed'>('idle')
  const resetToken = useMemo(() => searchParams.get('token')?.trim() || null, [searchParams])

  useEffect(() => {
    if (resetToken) return
    if (!isReady || isAuthenticated) return
    if (!authService.hasPasswordRecoveryParams()) return
    if (recoveryState !== 'idle') return

    let active = true
    setRecoveryState('restoring')

    void (async () => {
      try {
        await authService.restorePasswordRecoverySession()
        const session = await authService.getSession()

        if (!active) return
        if (session?.user) {
          setRecoveryState('idle')
          return
        }

        setRecoveryState('failed')
      } catch (error) {
        if (!active) return
        setRecoveryState('failed')
        notify.fromError(error, 'Не удалось открыть ссылку восстановления')
      }
    })()

    return () => {
      active = false
    }
  }, [isAuthenticated, isReady, recoveryState, resetToken])

  if (!isReady || recoveryState === 'restoring') {
    return <FullPageLoader label="Подготовка восстановления пароля…" />
  }

  if (!isAuthenticated && !resetToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Новый пароль</CardTitle>
          <CardDescription>Ссылка для восстановления недействительна или истекла</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              Запросите новое письмо для восстановления пароля и откройте ссылку из него.
            </AlertDescription>
          </Alert>
          <p className="text-muted-foreground text-sm">
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={routes.resetPassword}
            >
              Запросить новую ссылку
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый пароль</CardTitle>
        <CardDescription>Задайте новый пароль для вашей учётной записи</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm token={resetToken} />
      </CardContent>
    </Card>
  )
}
