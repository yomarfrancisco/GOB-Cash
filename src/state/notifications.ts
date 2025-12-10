import { create } from 'zustand'

type NotificationsState = {
  isNotificationsOpen: boolean
  openNotifications: () => void
  closeNotifications: () => void
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  isNotificationsOpen: false,
  openNotifications: () => set({ isNotificationsOpen: true }),
  closeNotifications: () => set({ isNotificationsOpen: false }),
}))

