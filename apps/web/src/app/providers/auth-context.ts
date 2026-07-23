import { createContext } from 'react'

import type { AuthProfile, Session, User } from '@shared/api'

export type { AuthProfile }

export type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: AuthProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  isReady: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
