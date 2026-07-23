export {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from './model/schemas'
export type {
  LoginFormValues,
  RegisterFormValues,
  ResetPasswordFormValues,
  UpdatePasswordFormValues,
} from './model/schemas'

export {
  resolveAuthProfile,
  getPostLoginPath,
  assertAuthenticated,
  assertGuest,
  assertRole,
  assertMemberStatus,
} from './model/access'
export type { AccessState, AccessDecision } from './model/access'

export {
  permissions,
  getPermissionsForRole,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './model/permissions'
export type { Permission } from './model/permissions'

export { usePermissions } from './model/use-permissions'
export { CanAccess } from './ui/can-access'

export {
  useLoginMutation,
  useRegisterMutation,
  useResetPasswordMutation,
  useUpdatePasswordMutation,
  useLogoutMutation,
} from './model/use-auth-mutations'

export { LoginForm } from './ui/login-form'
export { RegisterForm } from './ui/register-form'
export { ResetPasswordForm } from './ui/reset-password-form'
export { UpdatePasswordForm } from './ui/update-password-form'
export { LogoutButton } from './ui/logout-button'
