import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { resolveAuthProfile } from '@features/auth/model/access'
import { authService, type AuthProfile, type Session, type User } from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { FullPageLoader } from '@shared/ui'

import { AuthContext, type AuthContextValue } from './auth-context'

type AuthProviderProps = {
  children: ReactNode
}

async function loadProfile(user: User): Promise<AuthProfile> {
  const dbProfile = await authService.getProfile(user.id).catch(() => null)
  return resolveAuthProfile(user, dbProfile)
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      return
    }

    try {
      const nextProfile = await loadProfile(user)
      setProfile(nextProfile)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[AuthProvider] refreshProfile', toApiError(error).message)
      }
      setProfile(resolveAuthProfile(user, null))
    }
  }, [user])

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      try {
        // Restore persisted session (localStorage via Supabase SDK)
        await authService.ensureFreshSession(120)
        const nextSession = await authService.getSession()
        if (!mounted) return

        setSession(nextSession)
        setUser(nextSession?.user ?? null)

        if (nextSession?.user) {
          const nextProfile = await loadProfile(nextSession.user)
          if (mounted) setProfile(nextProfile)
        } else {
          setProfile(null)
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[AuthProvider] bootstrap', toApiError(error).message)
        }
        if (mounted) {
          setSession(null)
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
          setIsReady(true)
        }
      }
    }

    void bootstrap()

    const { subscription } = authService.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)

      if (!nextSession?.user) {
        setProfile(null)
        setIsLoading(false)
        setIsReady(true)
        return
      }

      void (async () => {
        try {
          const nextProfile = await loadProfile(nextSession.user)
          if (mounted) setProfile(nextProfile)
        } catch {
          if (mounted) setProfile(resolveAuthProfile(nextSession.user, null))
        } finally {
          if (mounted) {
            setIsLoading(false)
            setIsReady(true)
          }
        }
      })()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    await authService.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      isAuthenticated: Boolean(session?.user),
      isReady,
      refreshProfile,
      signOut,
    }),
    [session, user, profile, isLoading, isReady, refreshProfile, signOut],
  )

  if (!isReady) {
    return <FullPageLoader label="Восстановление сессии…" />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
