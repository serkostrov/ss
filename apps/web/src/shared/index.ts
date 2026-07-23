/**
 * Aggregate shared exports.
 * Prefer path imports: `@shared/ui`, `@shared/api`, `@shared/lib`, `@shared/config`.
 * API is not re-exported here to avoid `TableRow` name clash with the UI table primitive.
 */
export * from './ui'
export * from './lib'
export * from './config'
export * from './types'
