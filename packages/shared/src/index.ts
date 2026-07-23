export const USER_ROLES = ['admin', 'member'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = ['pending', 'confirmed', 'blocked'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const APP_NAME = 'АПСС — Северное сияние'
