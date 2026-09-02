import type { DbClient } from '../db.js'
import { log } from '../types.js'

export async function requireAdmin(
  db: DbClient,
  authorizationHeader: string | undefined,
): Promise<{ userId: string; fullName: string | null }> {
  const raw = authorizationHeader?.trim() ?? ''
  const token = raw.toLowerCase().startsWith('bearer ')
    ? raw.slice(7).trim()
    : raw
  if (!token) {
    const error = new Error('unauthorized')
    ;(error as Error & { status: number }).status = 401
    throw error
  }

  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) {
    log('warn', 'Outbound auth failed', { message: error?.message ?? 'no user' })
    const err = new Error('unauthorized')
    ;(err as Error & { status: number }).status = 401
    throw err
  }

  const { data: profile, error: profileError } = await db
    .from('users')
    .select('role, status, full_name, representative_id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile || profile.role !== 'admin' || profile.status === 'blocked') {
    const err = new Error('forbidden')
    ;(err as Error & { status: number }).status = 403
    throw err
  }

  let fullName = typeof profile.full_name === 'string' ? profile.full_name.trim() : ''
  if (!fullName && profile.representative_id) {
    const { data: representative } = await db
      .from('representatives')
      .select('full_name')
      .eq('id', profile.representative_id)
      .maybeSingle()
    fullName = typeof representative?.full_name === 'string' ? representative.full_name.trim() : ''
  }

  return { userId: data.user.id, fullName: fullName || null }
}
