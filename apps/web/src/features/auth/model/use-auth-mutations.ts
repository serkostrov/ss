import { useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers'
import {
  clearIntendedRoute,
  resolvePostAuthRedirect,
  type LoginLocationState,
} from '@app/lib/intended-route'
import { authService } from '@shared/api'
import { appConfig, routes } from '@shared/config'
import { getErrorMessage } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

import { resolveAuthProfile } from './access'
import type {
  LoginFormValues,
  RegisterFormValues,
  ResetPasswordFormValues,
  UpdatePasswordFormValues,
} from './schemas'

export function useLoginMutation() {
  const navigate = useNavigate()
  const location = useLocation()

  return useMutation({
    mutationFn: async (values: LoginFormValues) => {
      const { user } = await authService.signInWithPassword(values)
      const dbProfile = await authService.getProfile(user.id).catch(() => null)
      return resolveAuthProfile(user, dbProfile)
    },
    meta: { suppressErrorToast: true },
    onSuccess: (profile) => {
      notify.success('Вы вошли в систему')
      const state = location.state as LoginLocationState | null
      navigate(resolvePostAuthRedirect(profile, state), { replace: true })
    },
    onError: (error) => {
      notify.fromError(error, 'Не удалось войти')
    },
  })
}

export function useRegisterMutation() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (values: RegisterFormValues) => {
      return authService.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone || undefined,
        companyNameHint: values.companyNameHint || undefined,
        companyInnHint: values.companyInnHint || undefined,
        accepted: true,
      })
    },
    meta: { suppressErrorToast: true },
    onSuccess: async (result) => {
      if (result.session) {
        notify.success('Регистрация выполнена. Заявка отправлена на рассмотрение.')
        navigate(routes.cabinet.pending, { replace: true })
        return
      }
      notify.success('Проверьте email для подтверждения регистрации')
      navigate(routes.login, { replace: true })
    },
    onError: (error) => {
      notify.fromError(error, 'Не удалось зарегистрироваться')
    },
  })
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: async (values: ResetPasswordFormValues) => {
      const redirectTo = `${appConfig.env.appUrl}${routes.updatePassword}`
      await authService.requestPasswordReset(values.email, redirectTo)
    },
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      notify.success('Если аккаунт существует, мы отправили письмо со ссылкой')
    },
    onError: (error) => {
      notify.fromError(error, 'Не удалось отправить письмо')
    },
  })
}

export function useUpdatePasswordMutation() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  return useMutation({
    mutationFn: async (values: UpdatePasswordFormValues) => {
      await authService.updatePassword(values.password)
      await signOut()
    },
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      notify.success('Пароль обновлён. Войдите с новым паролем.')
      navigate(routes.login, { replace: true })
    },
    onError: (error) => {
      notify.fromError(error, getErrorMessage(error, 'Не удалось обновить пароль'))
    },
  })
}

export function useLogoutMutation() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  return useMutation({
    mutationFn: async () => {
      await signOut()
      clearIntendedRoute()
    },
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      notify.success('Вы вышли из системы')
      navigate(routes.login, { replace: true })
    },
    onError: (error) => {
      notify.fromError(error, 'Не удалось выйти')
    },
  })
}
