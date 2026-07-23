import { env } from './env'

export const APP_NAME = 'АПСС — Северное сияние'
export const APP_SHORT_NAME = 'АПСС'

export const routes = {
  root: '/',
  home: '/',
  login: '/login',
  register: '/register',
  resetPassword: '/reset-password',
  updatePassword: '/update-password',
  unauthorized: '/401',
  forbidden: '/403',
  notFound: '/404',
  admin: {
    root: '/admin',
    registrations: '/admin/registrations',
    levels: '/admin/settings',
    companies: '/admin/companies',
    company: (id: string) => `/admin/companies/${id}`,
    representatives: '/admin/representatives',
    representative: (id: string) => `/admin/representatives/${id}`,
    workGroups: '/admin/work-groups',
    workGroup: (id: string) => `/admin/work-groups/${id}`,
    messages: '/admin/messages',
    materials: '/admin/materials',
    material: (id: string) => `/admin/materials/${id}`,
    polls: '/admin/polls',
    poll: (id: string) => `/admin/polls/${id}`,
    staff: '/admin/staff',
    audit: '/admin/audit',
    settings: '/admin/settings',
  },
  cabinet: {
    root: '/cabinet',
    pending: '/cabinet/pending',
    blocked: '/cabinet/blocked',
    company: '/cabinet/company',
    directory: '/cabinet/directory',
    materials: '/cabinet/materials',
    material: (slug: string) => `/cabinet/materials/${slug}`,
    polls: '/cabinet/polls',
    poll: (id: string) => `/cabinet/polls/${id}`,
  },
} as const

export const appConfig = {
  name: APP_NAME,
  shortName: APP_SHORT_NAME,
  locale: 'ru-RU',
  defaultTheme: 'light' as const,
  themeStorageKey: 'apss-theme',
  routes,
  api: {
    staleTimeMs: 60_000,
    queryRetry: 1,
    mutationRetry: 0,
  },
  auth: {
    loginPath: routes.login,
    persistSession: true,
    updatePasswordPath: routes.updatePassword,
    unauthorizedPath: routes.unauthorized,
    forbiddenPath: routes.forbidden,
  },
  toast: {
    durationMs: 4_500,
    position: 'top-right' as const,
  },
  env: {
    appUrl: env.appUrl,
    supabaseUrl: env.supabaseUrl,
    mode: env.mode,
    isDev: env.isDev,
    isProd: env.isProd,
  },
} as const

export type AppConfig = typeof appConfig

export { env, getClientEnv } from './env'
export type { ClientEnv } from './env'
