import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RedirectState {
  intendedDestination: string | null
  setIntendedDestination: (path: string) => void
  clearIntendedDestination: () => string | null
}

export const useRedirectStore = create<RedirectState>()(
  persist(
    (set, get) => ({
      intendedDestination: null,

      setIntendedDestination: (path: string) =>
        set({ intendedDestination: path }),

      clearIntendedDestination: () => {
        const destination = get().intendedDestination
        set({ intendedDestination: null })
        return destination
      },
    }),
    {
      name: 'oop-redirect-storage',
    }
  )
)
