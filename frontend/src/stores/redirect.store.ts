import { create } from 'zustand'

interface RedirectState {
  intendedDestination: string | null
  setIntendedDestination: (path: string) => void
  clearIntendedDestination: () => string | null
}

export const useRedirectStore = create<RedirectState>()((set, get) => ({
  intendedDestination: null,

  setIntendedDestination: (path: string) =>
    set({ intendedDestination: path }),

  clearIntendedDestination: () => {
    const destination = get().intendedDestination
    set({ intendedDestination: null })
    return destination
  },
}))
