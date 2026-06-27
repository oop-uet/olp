import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastState {
  toasts: Toast[]
  show: (type: ToastType, message: string, durationMs?: number) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (type, message, durationMs = 4000) => {
    const id = Math.random().toString(36).slice(2)
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    if (durationMs > 0) {
      setTimeout(() => get().remove(id), durationMs)
    }
  },
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/** Convenience helpers usable outside React components (e.g. in api interceptors). */
export const toast = {
  success: (msg: string) => useToastStore.getState().show('success', msg),
  error: (msg: string) => useToastStore.getState().show('error', msg),
  info: (msg: string) => useToastStore.getState().show('info', msg),
  warning: (msg: string) => useToastStore.getState().show('warning', msg),
}
