import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'
import type { User, Farm } from '@/types'

interface AuthState {
  user: User | null
  farm: Farm | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean

  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  setFarm: (farm: Farm) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      farm: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password })
        const { access_token, refresh_token, user } = data.data
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', refresh_token)
        set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true })
      },

      register: async (name, email, password) => {
        const { data } = await api.post('/auth/register', { name, email, password })
        const { access_token, refresh_token, user } = data.data
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', refresh_token)
        set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true })
      },

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, farm: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      setFarm: (farm) => set({ farm }),
    }),
    {
      name: 'pastotech-auth',
      partialize: (s) => ({ user: s.user, farm: s.farm, isAuthenticated: s.isAuthenticated }),
    }
  )
)
